using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

/// <summary>
/// Prototype : affiche la salle vide et un avatar déplaçable (flèches / ZQSD / manette).
/// Se lance tout seul quand on appuie sur Play, dans n'importe quelle scène.
/// Images attendues dans Assets/Resources : room_empty.png (1860x720) et avatar_sheet.png (512x768, images de 128x192).
/// La salle mesure 1240x480 unités Unity ; la caméra, rapprochée, suit l'avatar.
/// Brouillard : la salle est noire au départ, l'avatar éclaire autour de lui et les zones visitées restent en pénombre.
/// </summary>
public class RoomPrototype : MonoBehaviour
{
    public static bool AutoStart = true;

    // Géométrie de la salle (mêmes valeurs que Tools/generate_rooms.py)
    const float VPX = 620f, VPY = 130f, FloorY = 270f, Foc = 300f, WallL = 170f, WallR = 1070f;
    const float RoomW = 1240f, RoomH = 480f;
    const float Edge = 75f;         // distance minimale entre l'avatar et le bord de l'image
    const float AvatarHeight = 92f; // hauteur de l'image de l'avatar au fond de la salle
    const float Speed = 95f;        // unités "monde" par seconde
    const float MinZ = 135f, MaxZ = 294f, Margin = 14f;
    const int FrameW = 128, FrameH = 192;
    const float ViewH = 360f;       // hauteur visible (caméra rapprochée)
    const int FogCell = 4;          // taille d'une case du brouillard (unités)
    const float DarkUnseen = 0.97f, DarkSeen = 0.5f;

    enum Dir { Down = 0, Left = 1, Right = 2, Up = 3 }

    Sprite[,] frames = new Sprite[4, 4];
    SpriteRenderer body;
    Transform player;
    float wx = 620f, z = 200f, animT;
    Camera cam;
    Texture2D fogTex;
    Color32[] fogPx;
    float[] explored;
    int fogW, fogH;
    Dir dir = Dir.Down;

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void Boot()
    {
        if (!AutoStart) return;
#if UNITY_2022_2_OR_NEWER
        if (FindAnyObjectByType<RoomPrototype>() != null) return;
#else
        if (FindObjectOfType<RoomPrototype>() != null) return;
#endif
        new GameObject("RoomPrototype").AddComponent<RoomPrototype>();
    }

    void Start()
    {
        var roomTex = Load("room_empty");
        var sheetTex = Load("avatar_sheet");
        if (roomTex == null || sheetTex == null) { enabled = false; return; }

        // Caméra rapprochée : on ne voit qu'une partie de la salle
        cam = Camera.main;
        if (cam == null) cam = new GameObject("Main Camera").AddComponent<Camera>();
        cam.orthographic = true;
        cam.orthographicSize = ViewH / 2f;
        cam.transform.position = new Vector3(0f, 0f, -10f);
        cam.backgroundColor = new Color32(29, 21, 38, 255);
        cam.clearFlags = CameraClearFlags.SolidColor;

        var bg = new GameObject("Room").AddComponent<SpriteRenderer>();
        bg.sprite = Sprite.Create(roomTex, new Rect(0, 0, roomTex.width, roomTex.height), new Vector2(0.5f, 0.5f), roomTex.width / RoomW);
        bg.sortingOrder = -100;

        // Découpe de la planche : ligne 0 (en haut de l'image) = bas, 1 = gauche, 2 = droite, 3 = haut
        for (int row = 0; row < 4; row++)
            for (int col = 0; col < 4; col++)
            {
                var r = new Rect(col * FrameW + 1, sheetTex.height - (row + 1) * FrameH + 1, FrameW - 2, FrameH - 2);   // marge de 1 px
                frames[row, col] = Sprite.Create(sheetTex, r, new Vector2(0.5f, 0f), 1f);
            }

        player = new GameObject("Player").transform;
        body = player.gameObject.AddComponent<SpriteRenderer>();
        body.sortingOrder = 10;

        var shadow = new GameObject("Shadow").AddComponent<SpriteRenderer>();
        shadow.transform.SetParent(player, false);
        shadow.sprite = MakeShadowSprite();
        shadow.sortingOrder = 9;

        // Brouillard : une texture basse résolution posée sur toute la salle, lissée à l'affichage
        fogW = (int)RoomW / FogCell; fogH = (int)RoomH / FogCell;
        fogTex = new Texture2D(fogW, fogH, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
        fogPx = new Color32[fogW * fogH];
        explored = new float[fogW * fogH];
        var fog = new GameObject("Fog").AddComponent<SpriteRenderer>();
        fog.sprite = Sprite.Create(fogTex, new Rect(0, 0, fogW, fogH), new Vector2(0.5f, 0.5f), 1f / FogCell);
        fog.sortingOrder = 50;

        UpdateVisual(false);
        SnapCamera();
    }

    void SnapCamera()
    {
        if (cam == null || player == null) return;
        var t = CameraTarget();
        cam.transform.position = new Vector3(t.x, t.y, cam.transform.position.z);
    }

    Vector2 CameraTarget()
    {
        float halfW = cam.orthographicSize * cam.aspect, halfH = cam.orthographicSize;
        float maxX = Mathf.Max(0f, RoomW / 2f - halfW), maxY = Mathf.Max(0f, RoomH / 2f - halfH);
        return new Vector2(Mathf.Clamp(player.position.x, -maxX, maxX),
                           Mathf.Clamp(player.position.y + BodyOffset(), -maxY, maxY));
    }

    float BodyOffset() => AvatarHeight * (Foc / z) * 0.45f;

    // lx, ly : centre de la lumière en coordonnées image (origine en haut à gauche) ; k : perspective
    void UpdateFog(float lx, float ly, float k)
    {
        float rx = 95f * k, ry = 78f * k;
        for (int j = 0; j < fogH; j++)
        {
            float py = RoomH - (j + 0.5f) * FogCell;      // la ligne 0 de la texture est en bas
            float dy = (py - ly) / ry;
            for (int i = 0; i < fogW; i++)
            {
                float dx = ((i + 0.5f) * FogCell - lx) / rx;
                float r = Mathf.Sqrt(dx * dx + dy * dy);
                float light = Mathf.Clamp01((1f - r) / 0.45f);
                light = light * light * (3f - 2f * light);
                int n = j * fogW + i;
                if (light > explored[n]) explored[n] = light;
                float a = Mathf.Lerp(DarkUnseen, DarkSeen, explored[n]) * (1f - light);
                fogPx[n] = new Color32(14, 9, 22, (byte)(a * 255f));
            }
        }
        fogTex.SetPixels32(fogPx);
        fogTex.Apply(false);
    }

    static Texture2D Load(string name)
    {
        var t = Resources.Load<Texture2D>(name);
        if (t == null) { Debug.LogError($"RoomPrototype : image '{name}' introuvable dans Assets/Resources."); return null; }
        t.filterMode = FilterMode.Bilinear;   // rendu lissé
        t.wrapMode = TextureWrapMode.Clamp;
        return t;
    }

    static Sprite MakeShadowSprite()
    {
        const int w = 80, h = 20;
        var t = new Texture2D(w, h, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear };
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                float dx = (x + 0.5f - w / 2f) / (w / 2f), dy = (y + 0.5f - h / 2f) / (h / 2f);
                t.SetPixel(x, y, dx * dx + dy * dy <= 1f ? new Color(0.16f, 0.09f, 0.22f, 0.28f) : Color.clear);
            }
        t.Apply();
        return Sprite.Create(t, new Rect(0, 0, w, h), new Vector2(0.5f, 0.6f), 1f);
    }

    Vector2 ReadInput()
    {
        Vector2 v = Vector2.zero;
#if ENABLE_INPUT_SYSTEM
        var kb = Keyboard.current;   // touches physiques : W/A/S/D = Z/Q/S/D sur AZERTY
        if (kb != null)
        {
            if (kb.leftArrowKey.isPressed || kb.aKey.isPressed) v.x -= 1;
            if (kb.rightArrowKey.isPressed || kb.dKey.isPressed) v.x += 1;
            if (kb.upArrowKey.isPressed || kb.wKey.isPressed) v.y += 1;
            if (kb.downArrowKey.isPressed || kb.sKey.isPressed) v.y -= 1;
        }
        if (Gamepad.current != null) v += Gamepad.current.leftStick.ReadValue();
#else
        v = new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
#endif
        return Vector2.ClampMagnitude(v, 1f);
    }

    void Update()
    {
        if (player == null) return;
        var v = ReadInput();
        bool moving = v.sqrMagnitude > 0.01f;
        if (moving)
        {
            z = Mathf.Clamp(z + v.y * Speed * Time.deltaTime, MinZ, MaxZ);   // haut = vers le fond
            float kz = Foc / z;
            float lo = Mathf.Max(WallL + Margin, VPX + (Edge - VPX) / kz);
            float hi = Mathf.Min(WallR - Margin, VPX + (RoomW - Edge - VPX) / kz);
            wx = Mathf.Clamp(wx + v.x * Speed * Time.deltaTime, lo, hi);
            dir = Mathf.Abs(v.x) > Mathf.Abs(v.y) ? (v.x < 0 ? Dir.Left : Dir.Right) : (v.y > 0 ? Dir.Up : Dir.Down);
            animT += Time.deltaTime;
        }
        else animT = 0f;
        UpdateVisual(moving);
    }

    void UpdateVisual(bool moving)
    {
        // Projection perspective : position au sol -> pixel de l'image de la salle
        float k = Foc / z;
        float sx = VPX + (wx - VPX) * k;
        float sy = VPY + (FloorY - VPY) * k;
        player.position = new Vector3(sx - RoomW / 2f, RoomH / 2f - sy, 0f);

        float s = AvatarHeight * k / FrameH;
        player.localScale = new Vector3(s, s, 1f);

        // La caméra suit l'avatar sans sortir de l'image
        if (cam != null)
        {
            var t = CameraTarget();
            var cp = cam.transform.position;
            float f = Mathf.Min(1f, Time.deltaTime * 6f);
            cam.transform.position = new Vector3(Mathf.Lerp(cp.x, t.x, f), Mathf.Lerp(cp.y, t.y, f), cp.z);
        }
        if (fogTex != null) UpdateFog(sx, sy - BodyOffset(), k);

        int col = moving ? Mathf.FloorToInt(animT * 8f) % 4 : 0;
        body.sprite = frames[(int)dir, col];
    }
}
