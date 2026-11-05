using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

/// <summary>
/// Prototype 3D : pièce carrée (sol, 4 murs très hauts qui se perdent dans le noir, une arche en pierre
/// avec alcôve sur chaque mur de côté, lumière) et avatar vu à la 3e personne.
/// - ZQSD / WASD (ou stick gauche) : se déplacer par rapport à la caméra
/// - Souris en maintenant un bouton, flèches ← → (ou stick droit) : tourner la caméra ; molette : zoom
/// L'avatar est un sprite 2D toujours tourné vers la caméra ; l'image (face / dos / profil) dépend de l'angle de vue.
/// Se lance tout seul quand on appuie sur Play, dans n'importe quelle scène.
/// Images attendues dans Assets/Resources : avatar_sheet.png (688x1212, images de 172x303),
/// tex_brick.png et tex_floor.png (160x160, raccordables, 1 carreau = 2 m : répétés en mosaïque, jamais étirés).
/// </summary>
public class RoomPrototype : MonoBehaviour
{
    public static bool AutoStart = true;

    // Réglages (mêmes valeurs que Tools/web/game.js)
    const float Room = 20f, Half = Room / 2f, WallH = 10f, WallT = 0.4f;   // murs très hauts, sans plafond
    const float LightH = 3.2f;      // lampe à hauteur d'homme
    const float FadeStart = 2.2f, FadeEnd = 7.7f;   // les murs se perdent dans le noir entre ces hauteurs
    const float Speed = 4.2f, AvatarHeight = 1.7f;
    const float Tile = 2f;          // mètres couverts par une texture
    // Arches des murs de côté : ouverture 3 m, montants 3 m, alcôve 1,4 m, encadrement qui dépasse de 0,2 m
    const float ArchW = 3f, ArchH = 3f, ArchDepth = 1.4f, ArchRing = 0.42f, ArchOut = 0.2f, AR = ArchW / 2f;
    const int FrameW = 172, FrameH = 303;
    const int RowDown = 0, RowLeft = 1, RowRight = 2, RowUp = 3;

    static readonly Color FloorColor = new Color32(185, 176, 207, 255);
    static readonly Color WallColor = new Color32(135, 120, 166, 255);
    static readonly Color BgColor = new Color32(7, 4, 11, 255);   // obscurité au-dessus des murs

    Sprite[,] frames = new Sprite[4, 4];
    Transform player, billboard;
    SpriteRenderer body;
    Camera cam;
    Vector3 pos = new Vector3(0f, 0f, -3f);
    float facing;                 // angle (degrés) de la direction regardée, autour de Y
    float yaw = 0f, pitch = 20f, dist = 5.5f, animT;

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
        cam = Camera.main;
        if (cam == null) cam = new GameObject("Main Camera").AddComponent<Camera>();
        cam.orthographic = false;
        cam.fieldOfView = 60f;
        cam.nearClipPlane = 0.1f;
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = BgColor;

        BuildRoom();
        BuildAvatar();
        UpdateCameraAndAvatar(false);
    }

    void BuildRoom()
    {
        var brick = LoadTiled("tex_brick");
        var paving = LoadTiled("tex_floor");
        // la mise à l'échelle des textures suit la taille de la face visible : 1 répétition tous les 2 m
        Box("Floor", new Vector3(0f, -0.05f, 0f), new Vector3(Room, 0.1f, Room), FloorColor, paving, new Vector2(Room / Tile, Room / Tile));
        var wallTiling = new Vector2(Room / Tile, WallH / Tile);
        Box("Wall N", new Vector3(0f, WallH / 2f, Half + WallT / 2f), new Vector3(Room, WallH, WallT), WallColor, brick, wallTiling);
        Box("Wall S", new Vector3(0f, WallH / 2f, -Half - WallT / 2f), new Vector3(Room, WallH, WallT), WallColor, brick, wallTiling);
        BuildArchWall(-1f, brick);
        BuildArchWall(1f, brick);

        // voile noir dégradé devant chaque mur : transparent en bas, noir en haut (pas de plafond visible)
        var fade = MakeFadeSprite();
        Fade(fade, new Vector3(0f, 0f, Half - 0.01f), 180f);
        Fade(fade, new Vector3(0f, 0f, -Half + 0.01f), 0f);
        // murs de côté : voile posé juste devant les encadrements des arches, pour les assombrir aussi
        Fade(fade, new Vector3(Half - ArchOut - 0.08f, 0f, 0f), -90f);
        Fade(fade, new Vector3(-Half + ArchOut + 0.08f, 0f, 0f), 90f);

        var lamp = new GameObject("Lamp").AddComponent<Light>();
        lamp.type = LightType.Point;
        lamp.color = new Color32(255, 241, 220, 255);
        lamp.range = 22f;
        lamp.intensity = 2.4f;
        lamp.shadows = LightShadows.Soft;
        lamp.transform.position = new Vector3(0f, LightH, 0f);

        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
        RenderSettings.ambientSkyColor = new Color32(40, 34, 54, 255);
        RenderSettings.ambientEquatorColor = new Color32(110, 98, 138, 255);
        RenderSettings.ambientGroundColor = new Color32(70, 58, 96, 255);
    }

    // ---------- Arches ----------
    // Repère local du mur : x le long du mur, y vers le haut, z vers l'intérieur de la pièce (0 = surface du mur)
    static Material baseMaterial;
    static Material NewMaterial(Color color, Texture2D tex)
    {
        if (baseMaterial == null)
        {
            var tmp = GameObject.CreatePrimitive(PrimitiveType.Cube);
            baseMaterial = new Material(tmp.GetComponent<Renderer>().sharedMaterial);   // matériau par défaut du pipeline
            Destroy(tmp);
        }
        var m = new Material(baseMaterial) { color = color };
        if (tex != null) { m.mainTexture = tex; m.mainTextureScale = Vector2.one; m.color = color; }
        return m;
    }

    void BuildArchWall(float sideSign, Texture2D brick)
    {
        var root = new GameObject(sideSign < 0 ? "Arch wall W" : "Arch wall E").transform;
        root.position = new Vector3(sideSign * Half, 0f, 0f);
        root.rotation = Quaternion.Euler(0f, sideSign < 0 ? 90f : -90f, 0f);   // z local -> intérieur de la pièce

        // surface du mur avec l'ouverture découpée (UV en mètres : briques continues, jamais étirées)
        var wall = new MeshBuilder();
        Vector3 into = Vector3.forward;
        wall.WallRect(-Half, 0f, -AR, WallH, 0f, into);
        wall.WallRect(AR, 0f, Half, WallH, 0f, into);
        wall.WallRect(-AR, ArchH + AR, AR, WallH, 0f, into);
        const int slices = 24;
        for (int k = 0; k < slices; k++)                 // écoinçons au-dessus de l'arc
        {
            float y0 = ArchH + k * AR / slices, y1 = y0 + AR / slices;
            float w0 = Mathf.Sqrt(Mathf.Max(0f, AR * AR - (y0 - ArchH) * (y0 - ArchH)));
            wall.WallRect(-AR, y0, -w0, y1, 0f, into);
            wall.WallRect(w0, y0, AR, y1, 0f, into);
        }
        AddMesh(root, "Wall", wall, NewMaterial(brick != null ? Color.white : WallColor, brick));

        // alcôve : fond, côtés et voûte, tournés vers l'intérieur
        var niche = new MeshBuilder();
        float zb = -ArchDepth;
        niche.WallRect(-AR, 0f, AR, ArchH, zb, into);
        const int seg = 20;
        for (int i = 0; i < seg; i++)
        {
            float a0 = Mathf.PI * i / seg, a1 = Mathf.PI * (i + 1) / seg;
            Vector3 p0 = new Vector3(Mathf.Cos(a0) * AR, ArchH + Mathf.Sin(a0) * AR, 0f);
            Vector3 p1 = new Vector3(Mathf.Cos(a1) * AR, ArchH + Mathf.Sin(a1) * AR, 0f);
            Vector3 c = new Vector3(0f, ArchH, zb);
            niche.Tri(c, p0 + Vector3.forward * zb, p1 + Vector3.forward * zb, into, UVxy(c), UVxy(p0), UVxy(p1));        // fond (demi-disque)
            Vector3 back = Vector3.forward * zb;
            Vector3 inward = -(p0 + p1) * 0.5f + new Vector3(0f, ArchH, 0f); inward.z = 0f;
            float s0 = a0 * AR / Tile, s1 = a1 * AR / Tile;
            niche.Quad(p0 + back, p1 + back, p1, p0, inward,
                new Vector2(s0, zb / Tile), new Vector2(s1, zb / Tile), new Vector2(s1, 0f), new Vector2(s0, 0f));             // voûte
        }
        foreach (float sx in new[] { -AR, AR })
        {
            Vector3 n = new Vector3(-Mathf.Sign(sx), 0f, 0f);
            niche.Quad(new Vector3(sx, 0f, zb), new Vector3(sx, 0f, 0f), new Vector3(sx, ArchH, 0f), new Vector3(sx, ArchH, zb), n,
                new Vector2(zb / Tile, 0f), Vector2.zero, new Vector2(0f, ArchH / Tile), new Vector2(zb / Tile, ArchH / Tile));
        }
        AddMesh(root, "Niche", niche, NewMaterial(new Color32(143, 134, 168, 255), brick));
        LocalCube(root, "Step", new Vector3(0f, 0.11f, zb / 2f), new Vector3(ArchW, 0.22f, ArchDepth), new Color32(194, 184, 214, 255));

        // encadrement en pierre claire qui dépasse du mur
        Color32[] stones = { new Color32(207, 198, 223, 255), new Color32(197, 186, 216, 255), new Color32(214, 206, 229, 255) };
        const int rows = 6; const float gap = 0.035f; float bh = ArchH / rows;
        for (int i = 0; i < rows; i++)                    // montants : blocs alternés large / étroit
        {
            float w = i % 2 == 1 ? 0.42f : 0.62f;
            foreach (float side in new[] { -1f, 1f })
                LocalCube(root, "Jamb", new Vector3(side * (AR + w / 2f), i * bh + bh / 2f, ArchOut / 2f),
                          new Vector3(w, bh - gap, ArchOut), stones[(i + (side > 0 ? 1 : 0)) % 3]);
        }
        foreach (float side in new[] { -1f, 1f })        // socles
            LocalCube(root, "Base", new Vector3(side * (AR + 0.36f), 0.13f, (ArchOut + 0.08f) / 2f), new Vector3(0.78f, 0.26f, ArchOut + 0.08f), stones[2]);
        const int n9 = 9; const float ga = 0.018f;
        for (int i = 0; i < n9; i++)                      // claveaux en éventail, clé de voûte plus grande
        {
            bool key = i == (n9 - 1) / 2;
            float a0 = Mathf.PI - i * Mathf.PI / n9 - ga, a1 = Mathf.PI - (i + 1) * Mathf.PI / n9 + ga;
            var mb = new MeshBuilder();
            mb.Sector(new Vector3(0f, ArchH, 0f), AR, AR + ArchRing + (key ? 0.16f : 0f), a1, a0, ArchOut + (key ? 0.06f : 0f));
            AddMesh(root, key ? "Keystone" : "Voussoir", mb, NewMaterial(stones[i % 3], null));
        }
    }

    static Vector2 UVxy(Vector3 p) => new Vector2(p.x / Tile, p.y / Tile);

    static void AddMesh(Transform parent, string name, MeshBuilder mb, Material mat)
    {
        var go = new GameObject(name);
        go.transform.SetParent(parent, false);
        go.AddComponent<MeshFilter>().sharedMesh = mb.Build();
        go.AddComponent<MeshRenderer>().sharedMaterial = mat;
    }

    static void LocalCube(Transform parent, string name, Vector3 localPos, Vector3 size, Color color)
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
        go.name = name;
        Destroy(go.GetComponent<Collider>());
        go.transform.SetParent(parent, false);
        go.transform.localPosition = localPos;
        go.transform.localScale = size;
        go.GetComponent<Renderer>().material.color = color;
    }

    /// <summary>Petit constructeur de maillage : chaque face est orientée vers la normale demandée.</summary>
    class MeshBuilder
    {
        readonly System.Collections.Generic.List<Vector3> v = new System.Collections.Generic.List<Vector3>();
        readonly System.Collections.Generic.List<Vector2> uv = new System.Collections.Generic.List<Vector2>();
        readonly System.Collections.Generic.List<int> t = new System.Collections.Generic.List<int>();

        public void Tri(Vector3 a, Vector3 b, Vector3 c, Vector3 want, Vector2 ua, Vector2 ub, Vector2 uc)
        {
            if (Vector3.Dot(Vector3.Cross(b - a, c - a), want) < 0f) { (b, c) = (c, b); (ub, uc) = (uc, ub); }
            int i = v.Count;
            v.Add(a); v.Add(b); v.Add(c); uv.Add(ua); uv.Add(ub); uv.Add(uc);
            t.Add(i); t.Add(i + 1); t.Add(i + 2);
        }
        public void Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 want, Vector2 ua, Vector2 ub, Vector2 uc, Vector2 ud)
        {
            Tri(a, b, c, want, ua, ub, uc);
            Tri(a, c, d, want, ua, uc, ud);
        }
        // rectangle vertical dans le plan z, UV = position en mètres / taille d'un carreau
        public void WallRect(float x0, float y0, float x1, float y1, float z, Vector3 want)
        {
            if (x1 - x0 < 1e-4f || y1 - y0 < 1e-4f) return;
            Vector3 a = new Vector3(x0, y0, z), b = new Vector3(x1, y0, z), c = new Vector3(x1, y1, z), d = new Vector3(x0, y1, z);
            Quad(a, b, c, d, want, UVxy(a), UVxy(b), UVxy(c), UVxy(d));
        }
        // bloc en secteur d'anneau (claveau), extrudé de z = 0 à z = depth
        public void Sector(Vector3 center, float r1, float r2, float aStart, float aEnd, float depth)
        {
            const int n = 4;
            Vector3 mid = center + new Vector3(Mathf.Cos((aStart + aEnd) / 2f), Mathf.Sin((aStart + aEnd) / 2f), 0f) * ((r1 + r2) / 2f) + Vector3.forward * depth / 2f;
            Vector3 P(float a, float r, float z) => center + new Vector3(Mathf.Cos(a) * r, Mathf.Sin(a) * r, z);
            for (int i = 0; i < n; i++)
            {
                float a0 = Mathf.Lerp(aStart, aEnd, i / (float)n), a1 = Mathf.Lerp(aStart, aEnd, (i + 1) / (float)n);
                Face(P(a0, r1, depth), P(a1, r1, depth), P(a1, r2, depth), P(a0, r2, depth), mid);   // face avant
                Face(P(a0, r1, 0f), P(a1, r1, 0f), P(a1, r1, depth), P(a0, r1, depth), mid);        // intrados
                Face(P(a0, r2, 0f), P(a1, r2, 0f), P(a1, r2, depth), P(a0, r2, depth), mid);        // extrados
            }
            Face(P(aStart, r1, 0f), P(aStart, r2, 0f), P(aStart, r2, depth), P(aStart, r1, depth), mid);
            Face(P(aEnd, r1, 0f), P(aEnd, r2, 0f), P(aEnd, r2, depth), P(aEnd, r1, depth), mid);
        }
        void Face(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Vector3 blockCenter)
        {
            Vector3 want = (a + b + c + d) * 0.25f - blockCenter;   // normale vers l'extérieur du bloc
            Quad(a, b, c, d, want, Vector2.zero, Vector2.right, Vector2.one, Vector2.up);
        }
        public Mesh Build()
        {
            var m = new Mesh();
            m.SetVertices(v); m.SetUVs(0, uv); m.SetTriangles(t, 0);
            m.RecalculateNormals(); m.RecalculateBounds();
            return m;
        }
    }

    static Sprite MakeFadeSprite()
    {
        const int h = 64;
        var t = new Texture2D(1, h, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
        for (int y = 0; y < h; y++)
        {
            float height = (y + 0.5f) / h * WallH;
            float a = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(FadeStart, FadeEnd, height));
            t.SetPixel(0, y, new Color(BgColor.r, BgColor.g, BgColor.b, a));
        }
        t.Apply();
        return Sprite.Create(t, new Rect(0, 0, 1, h), new Vector2(0.5f, 0f), 1f);
    }

    static void Fade(Sprite sprite, Vector3 basePos, float yRot)
    {
        var sr = new GameObject("Wall fade").AddComponent<SpriteRenderer>();
        sr.sprite = sprite;
        sr.transform.position = basePos;
        sr.transform.rotation = Quaternion.Euler(0f, yRot, 0f);
        sr.transform.localScale = new Vector3(Room, WallH / 64f, 1f);
    }

    static Texture2D LoadTiled(string name)
    {
        var t = Resources.Load<Texture2D>(name);
        if (t == null) { Debug.LogWarning($"RoomPrototype : texture '{name}' introuvable, couleur unie utilisée."); return null; }
        t.wrapMode = TextureWrapMode.Repeat;   // répétition en mosaïque
        t.filterMode = FilterMode.Point;       // pixels nets
        t.anisoLevel = 8;
        return t;
    }

    static void Box(string name, Vector3 center, Vector3 size, Color color, Texture2D tex, Vector2 tiling)
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
        go.name = name;
        go.transform.position = center;
        go.transform.localScale = size;
        var m = go.GetComponent<Renderer>().material;   // matériau par défaut du pipeline
        if (tex != null)
        {
            m.color = Color.white;
            m.mainTexture = tex;
            m.mainTextureScale = tiling;
        }
        else m.color = color;
    }

    void BuildAvatar()
    {
        var sheetTex = Resources.Load<Texture2D>("avatar_sheet");
        if (sheetTex == null) { Debug.LogError("RoomPrototype : image 'avatar_sheet' introuvable dans Assets/Resources."); enabled = false; return; }
        sheetTex.filterMode = FilterMode.Bilinear;
        float ppu = (FrameH - 2) / AvatarHeight;          // l'avatar mesure AvatarHeight mètres
        for (int row = 0; row < 4; row++)
            for (int col = 0; col < 4; col++)
            {
                var r = new Rect(col * FrameW + 1, sheetTex.height - (row + 1) * FrameH + 1, FrameW - 2, FrameH - 2);
                frames[row, col] = Sprite.Create(sheetTex, r, new Vector2(0.5f, 0f), ppu);
            }

        player = new GameObject("Player").transform;
        billboard = new GameObject("Sprite").transform;
        billboard.SetParent(player, false);
        body = billboard.gameObject.AddComponent<SpriteRenderer>();

        // ombre ronde au sol
        var blob = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        blob.name = "Shadow";
        Destroy(blob.GetComponent<Collider>());
        blob.transform.SetParent(player, false);
        blob.transform.localPosition = new Vector3(0f, 0.005f, 0f);
        blob.transform.localScale = new Vector3(0.64f, 0.002f, 0.45f);
        var br = blob.GetComponent<Renderer>();
        br.material.color = new Color32(40, 24, 56, 255);
        br.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
    }

    void ReadInput(out Vector2 move, out Vector2 look, out float zoom)
    {
        move = Vector2.zero; look = Vector2.zero; zoom = 0f;
#if ENABLE_INPUT_SYSTEM
        var kb = Keyboard.current;   // touches physiques : W/A/S/D = Z/Q/S/D sur AZERTY
        if (kb != null)
        {
            if (kb.wKey.isPressed || kb.upArrowKey.isPressed) move.y += 1;
            if (kb.sKey.isPressed || kb.downArrowKey.isPressed) move.y -= 1;
            if (kb.aKey.isPressed) move.x -= 1;
            if (kb.dKey.isPressed) move.x += 1;
            if (kb.leftArrowKey.isPressed) look.x -= 130f * Time.deltaTime;
            if (kb.rightArrowKey.isPressed) look.x += 130f * Time.deltaTime;
        }
        var mouse = Mouse.current;
        if (mouse != null)
        {
            if (mouse.leftButton.isPressed || mouse.rightButton.isPressed) look += mouse.delta.ReadValue() * 0.25f;
            zoom = mouse.scroll.ReadValue().y * 0.002f;
        }
        var pad = Gamepad.current;
        if (pad != null)
        {
            move += pad.leftStick.ReadValue();
            look += pad.rightStick.ReadValue() * 150f * Time.deltaTime;
        }
#else
        move = new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
        if (Input.GetMouseButton(0) || Input.GetMouseButton(1))
            look = new Vector2(Input.GetAxis("Mouse X"), Input.GetAxis("Mouse Y")) * 4f;
        zoom = Input.mouseScrollDelta.y * 0.2f;
#endif
        move = Vector2.ClampMagnitude(move, 1f);
    }

    void Update()
    {
        if (player == null) return;
        ReadInput(out var move, out var look, out var zoom);
        yaw += look.x;
        pitch = Mathf.Clamp(pitch - look.y, 3f, 70f);
        dist = Mathf.Clamp(dist * (1f - zoom), 2.5f, 10f);

        bool moving = move.sqrMagnitude > 0.0025f;
        if (moving)
        {
            // avant = direction de la caméra à plat
            var rot = Quaternion.Euler(0f, yaw, 0f);
            Vector3 dir = rot * new Vector3(move.x, 0f, move.y);
            float lim = Half - 0.35f - (Mathf.Abs(pos.z) < AR + 1f ? ArchOut + 0.1f : 0f);   // recul devant les arches
            pos.x = Mathf.Clamp(pos.x + dir.x * Speed * Time.deltaTime, -lim, lim);
            pos.z = Mathf.Clamp(pos.z + dir.z * Speed * Time.deltaTime, -lim, lim);
            facing = Mathf.Atan2(dir.x, dir.z) * Mathf.Rad2Deg;
            animT += Time.deltaTime;
        }
        else animT = 0f;
        UpdateCameraAndAvatar(moving);
    }

    void UpdateCameraAndAvatar(bool moving)
    {
        if (player == null) return;
        player.position = pos;

        // caméra en orbite autour de l'avatar, gardée dans la pièce
        Vector3 target = pos + Vector3.up * 1.1f;
        Vector3 camPos = target + Quaternion.Euler(pitch, yaw, 0f) * new Vector3(0f, 0f, -dist);
        float m = Half - 0.25f;
        camPos.x = Mathf.Clamp(camPos.x, -m, m);
        camPos.z = Mathf.Clamp(camPos.z, -m, m);
        camPos.y = Mathf.Clamp(camPos.y, 0.3f, WallH - 0.25f);
        cam.transform.position = camPos;
        cam.transform.LookAt(target);

        // le sprite fait face à la caméra (rotation autour de Y seulement)
        Vector3 view = pos - camPos; view.y = 0f;
        if (view.sqrMagnitude > 0.0001f) billboard.rotation = Quaternion.LookRotation(view.normalized, Vector3.up);

        // image selon l'angle entre la direction de l'avatar et la caméra
        Vector3 f = Quaternion.Euler(0f, facing, 0f) * Vector3.forward;
        Vector3 v = view.normalized;
        float dot = Vector3.Dot(f, v);
        float side = Vector3.Dot(f, Vector3.Cross(Vector3.up, v));   // > 0 : regarde vers la droite de l'écran
        int row = dot < -0.7f ? RowDown : dot > 0.7f ? RowUp : side > 0f ? RowRight : RowLeft;
        int col = moving ? Mathf.FloorToInt(animT * 8f) % 4 : 0;
        body.sprite = frames[row, col];
    }
}
