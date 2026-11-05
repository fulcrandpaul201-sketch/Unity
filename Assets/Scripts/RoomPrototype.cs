using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

/// <summary>
/// Prototype : affiche la salle vide et un avatar déplaçable (flèches / ZQSD / manette).
/// Se lance tout seul quand on appuie sur Play, dans n'importe quelle scène.
/// Images attendues dans Assets/Resources : room_empty.png (1860x720) et avatar_sheet.png (512x768, images de 128x192).
/// La salle mesure 1240x480 unités Unity ; la caméra montre 480 unités de haut et suit l'avatar.
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

    enum Dir { Down = 0, Left = 1, Right = 2, Up = 3 }

    Sprite[,] frames = new Sprite[4, 4];
    SpriteRenderer body;
    Transform player;
    float wx = 620f, z = 200f, animT;
    Camera cam;
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

        // Caméra : la salle remplit exactement l'écran (480 unités de haut)
        cam = Camera.main;
        if (cam == null) cam = new GameObject("Main Camera").AddComponent<Camera>();
        cam.orthographic = true;
        cam.orthographicSize = RoomH / 2f;
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

        UpdateVisual(false);
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
            float halfW = cam.orthographicSize * cam.aspect;
            float maxX = Mathf.Max(0f, RoomW / 2f - halfW);
            float tx = Mathf.Clamp(player.position.x, -maxX, maxX);
            var cp = cam.transform.position;
            cam.transform.position = new Vector3(Mathf.Lerp(cp.x, tx, Mathf.Min(1f, Time.deltaTime * 6f)), 0f, cp.z);
        }

        int col = moving ? Mathf.FloorToInt(animT * 8f) % 4 : 0;
        body.sprite = frames[(int)dir, col];
    }
}
