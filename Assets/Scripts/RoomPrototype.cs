using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

/// <summary>
/// Prototype : salle carrée vue de dessus, sans texture, et un avatar qui se déplace librement
/// (haut / bas / gauche / droite) avec les flèches, ZQSD ou une manette.
/// Se lance tout seul quand on appuie sur Play, dans n'importe quelle scène.
/// Image attendue : Assets/Resources/avatar_sheet.png (688x1212, images de 172x303).
/// 1 unité Unity = 1 pixel de la page web de référence (écran de 960x720).
/// </summary>
public class RoomPrototype : MonoBehaviour
{
    public static bool AutoStart = true;

    // Dimensions (mêmes valeurs que Tools/web/game.js)
    const float ScreenW = 960f, ScreenH = 720f;
    const float Floor = 560f;                           // côté du sol carré
    const float Side = 40f, Top = 120f, Bottom = 40f;   // épaisseur des murs
    const float Face = 64f;                             // face visible du mur du haut
    const float AvatarHeight = 120f;
    const float FootW = 22f, FootH = 24f;               // zone de collision aux pieds
    const float Speed = 230f;
    const int FrameW = 172, FrameH = 303;               // voir Assets/Resources/avatar_sheet.json

    static readonly Color32 BgColor = new Color32(42, 32, 56, 255);
    static readonly Color32 WallTopColor = new Color32(91, 76, 120, 255);
    static readonly Color32 WallFaceColor = new Color32(135, 120, 166, 255);
    static readonly Color32 FloorColor = new Color32(185, 176, 207, 255);
    static readonly Color32 ShadeColor = new Color32(40, 28, 60, 41);

    enum Dir { Down = 0, Left = 1, Right = 2, Up = 3 }

    Sprite[,] frames = new Sprite[4, 4];
    SpriteRenderer body;
    Transform player;
    Vector2 pos = new Vector2(Floor / 2f, Floor / 2f + 60f);   // pieds, en pixels depuis le coin haut-gauche du sol
    float animT;
    Dir dir = Dir.Down;
    Sprite white;

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

    // Convertit un point « écran de référence » (origine en haut à gauche) en position Unity
    static Vector3 ToWorld(float x, float y, float zOrder = 0f) => new Vector3(x - ScreenW / 2f, ScreenH / 2f - y, zOrder);

    void Start()
    {
        var cam = Camera.main;
        if (cam == null) cam = new GameObject("Main Camera").AddComponent<Camera>();
        cam.orthographic = true;
        cam.orthographicSize = ScreenH / 2f;
        cam.transform.position = new Vector3(0f, 0f, -10f);
        cam.backgroundColor = BgColor;
        cam.clearFlags = CameraClearFlags.SolidColor;

        var tex = Texture2D.whiteTexture;
        white = Sprite.Create(tex, new Rect(0, 0, tex.width, tex.height), new Vector2(0f, 1f), tex.width);   // 1x1 unité, pivot en haut à gauche

        float rx = (ScreenW - Floor) / 2f, ry = Top;
        Rect("WallTop", rx - Side, 0f, Floor + Side * 2f, Top + Floor + Bottom, WallTopColor, -30);
        Rect("WallFace", rx, Top - Face, Floor, Face, WallFaceColor, -20);
        Rect("Floor", rx, ry, Floor, Floor, FloorColor, -10);
        Rect("Shade", rx, ry, Floor, 14f, ShadeColor, -5);

        var sheetTex = Resources.Load<Texture2D>("avatar_sheet");
        if (sheetTex == null) { Debug.LogError("RoomPrototype : image 'avatar_sheet' introuvable dans Assets/Resources."); enabled = false; return; }
        sheetTex.filterMode = FilterMode.Bilinear;
        // ligne 0 (en haut de l'image) = bas, 1 = gauche, 2 = droite, 3 = haut ; marge de 1 px entre les images
        for (int row = 0; row < 4; row++)
            for (int col = 0; col < 4; col++)
            {
                var r = new Rect(col * FrameW + 1, sheetTex.height - (row + 1) * FrameH + 1, FrameW - 2, FrameH - 2);
                frames[row, col] = Sprite.Create(sheetTex, r, new Vector2(0.5f, 0f), (FrameH - 2) / AvatarHeight);
            }

        player = new GameObject("Player").transform;
        body = player.gameObject.AddComponent<SpriteRenderer>();
        body.sortingOrder = 10;

        var shadow = new GameObject("Shadow").AddComponent<SpriteRenderer>();
        shadow.transform.SetParent(player, false);
        shadow.sprite = MakeShadowSprite(AvatarHeight * FrameW / FrameH);
        shadow.sortingOrder = 9;

        UpdateVisual(false);
    }

    void Rect(string name, float x, float y, float w, float h, Color32 color, int order)
    {
        var sr = new GameObject(name).AddComponent<SpriteRenderer>();
        sr.sprite = white;
        sr.color = color;
        sr.sortingOrder = order;
        sr.transform.position = ToWorld(x, y);
        sr.transform.localScale = new Vector3(w, h, 1f);
    }

    static Sprite MakeShadowSprite(float avatarW)
    {
        int w = Mathf.RoundToInt(avatarW * 0.6f), h = Mathf.RoundToInt(avatarW * 0.2f);
        var t = new Texture2D(w, h, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear };
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                float dx = (x + 0.5f - w / 2f) / (w / 2f), dy = (y + 0.5f - h / 2f) / (h / 2f);
                t.SetPixel(x, y, dx * dx + dy * dy <= 1f ? new Color(0.16f, 0.09f, 0.22f, 0.25f) : Color.clear);
            }
        t.Apply();
        return Sprite.Create(t, new Rect(0, 0, w, h), new Vector2(0.5f, 0.5f), 1f);
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
            // y de l'écran de référence vers le bas, y Unity vers le haut
            pos.x = Mathf.Clamp(pos.x + v.x * Speed * Time.deltaTime, FootW, Floor - FootW);
            pos.y = Mathf.Clamp(pos.y - v.y * Speed * Time.deltaTime, FootH, Floor);
            if (Mathf.Abs(v.x) > Mathf.Abs(v.y)) dir = v.x < 0 ? Dir.Left : Dir.Right;
            else if (Mathf.Abs(v.y) > Mathf.Abs(v.x)) dir = v.y > 0 ? Dir.Up : Dir.Down;
            animT += Time.deltaTime;
        }
        else animT = 0f;
        UpdateVisual(moving);
    }

    void UpdateVisual(bool moving)
    {
        float rx = (ScreenW - Floor) / 2f, ry = Top;
        player.position = ToWorld(rx + pos.x, ry + pos.y);
        int col = moving ? Mathf.FloorToInt(animT * 8f) % 4 : 0;
        body.sprite = frames[(int)dir, col];
    }
}
