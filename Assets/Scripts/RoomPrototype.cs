using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

/// <summary>
/// Prototype : affiche la salle vide et un avatar déplaçable (flèches / ZQSD / manette).
/// Se lance tout seul quand on appuie sur Play, dans n'importe quelle scène.
/// Images attendues dans Assets/Resources : room_empty.png (320x240) et avatar_sheet.png (64x96).
/// 1 unité Unity = 1 pixel de l'image de la salle.
/// </summary>
public class RoomPrototype : MonoBehaviour
{
    public static bool AutoStart = true;

    // Géométrie de la salle (mêmes valeurs que Tools/generate_rooms.py)
    const float VPX = 160f, VPY = 80f, FloorY = 136f, Foc = 160f, WallL = 80f, WallR = 240f;
    const float CharScale = 1.5f;   // taille de l'avatar au fond de la salle
    const float Speed = 48f;        // unités "monde" par seconde
    const float MinZ = 70f, MaxZ = 157f, Margin = 7f;
    const int FrameW = 16, FrameH = 24;

    enum Dir { Down = 0, Left = 1, Right = 2, Up = 3 }

    Sprite[,] frames = new Sprite[4, 4];
    SpriteRenderer body;
    Transform player;
    float wx = 160f, z = 110f, animT;
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

        // Caméra : la salle remplit exactement l'écran (240 unités de haut)
        var cam = Camera.main;
        if (cam == null) cam = new GameObject("Main Camera").AddComponent<Camera>();
        cam.orthographic = true;
        cam.orthographicSize = 120f;
        cam.transform.position = new Vector3(0f, 0f, -10f);
        cam.backgroundColor = new Color32(29, 21, 38, 255);
        cam.clearFlags = CameraClearFlags.SolidColor;

        var bg = new GameObject("Room").AddComponent<SpriteRenderer>();
        bg.sprite = Sprite.Create(roomTex, new Rect(0, 0, roomTex.width, roomTex.height), new Vector2(0.5f, 0.5f), 1f);
        bg.sortingOrder = -100;

        // Découpe de la planche : ligne 0 (en haut de l'image) = bas, 1 = gauche, 2 = droite, 3 = haut
        for (int row = 0; row < 4; row++)
            for (int col = 0; col < 4; col++)
            {
                var r = new Rect(col * FrameW, sheetTex.height - (row + 1) * FrameH, FrameW, FrameH);
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
        t.filterMode = FilterMode.Point;   // pixels nets
        t.wrapMode = TextureWrapMode.Clamp;
        return t;
    }

    static Sprite MakeShadowSprite()
    {
        const int w = 12, h = 4;
        var t = new Texture2D(w, h, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point };
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
            wx = Mathf.Clamp(wx + v.x * Speed * Time.deltaTime, WallL + Margin, WallR - Margin);
            z = Mathf.Clamp(z + v.y * Speed * Time.deltaTime, MinZ, MaxZ);   // haut = vers le fond
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
        player.position = new Vector3(sx - 160f, 120f - sy, 0f);

        // Taille arrondie au tiers de pixel pour garder un rendu net
        float s = Mathf.Max(2f, Mathf.Round(3f * CharScale * k)) / 3f;
        player.localScale = new Vector3(s, s, 1f);

        int col = moving ? Mathf.FloorToInt(animT * 8f) % 4 : 0;
        body.sprite = frames[(int)dir, col];
    }
}
