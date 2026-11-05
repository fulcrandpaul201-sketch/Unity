using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

/// <summary>
/// Prototype 3D : pièce carrée (sol, 4 murs très hauts qui se perdent dans le noir, une arche en pierre
/// avec alcôve sur chaque mur, piliers, soubassement et corniche, lumière) et avatar vu à la 3e personne.
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
    const float JumpSpeed = 5.4f, Gravity = 15f;   // saut d'environ 1 m
    const float PlayerR = 0.3f;     // rayon de collision de l'avatar
    // Cour de récréation : obstacles en boîtes alignées (bancs : on peut monter dessus ; bascule : on la contourne)
    struct Obstacle { public float minX, maxX, minZ, maxZ, top; public bool standable; }
    readonly System.Collections.Generic.List<Obstacle> obstacles = new System.Collections.Generic.List<Obstacle>();
    const float BenchLen = 2.2f, BenchSeat = 0.45f, BenchDepth = 0.46f, BallR = 0.22f;
    Rigidbody ball;
    float kickCooldown;
    const float Tile = 2f;          // mètres couverts par une texture
    // Arches des murs de côté : ouverture 3 m, montants 3 m, alcôve 1,4 m, encadrement qui dépasse de 0,2 m
    const float ArchW = 3f, ArchH = 3f, ArchDepth = 1.4f, ArchRing = 0.42f, ArchOut = 0.2f, AR = ArchW / 2f;
    // Même structure sur les 4 murs : une arche centrale, piliers entre elles et dans les angles, soubassement et corniche
    static readonly float[] ArchX = { 0f };   // une arche au centre de chaque mur
    static readonly float[] PillarX = { -Half + 0.35f, -3.25f, 3.25f, Half - 0.35f };
    const float PillarW = 0.7f, PillarOut = 0.3f, PillarH = 5f;
    const float PlinthH = 0.32f, PlinthOut = 0.1f, CorniceY = 5.35f, CorniceH = 0.26f, CorniceOut = 0.2f;
    const float WallClear = 0.8f;   // distance minimale avatar / mur
    // Fontaine au centre : grand bassin, vasque du milieu, vasque du haut
    const float BasinIn = 1.6f, BasinOut = 1.95f, Water0 = 0.42f, FountainCollide = 2.3f;
    const float Bowl1Y = 1.25f, Bowl1R = 0.98f, Bowl2Y = 1.95f, Bowl2R = 0.48f, SpoutY = 2.38f;
    // Fenêtres sur les murs de gauche et de droite : plein cintre, appui à 1,5 m, sommet à 3,4 m
    const float WinW = 1.4f, WinBottom = 1.5f, WinSpring = 2.7f, WinDepth = 0.45f, WinRing = 0.3f, WinOut = 0.16f, WR = WinW / 2f;
    static readonly float[] WinX = { -6.5f, 6.5f };
    const int FrameW = 172, FrameH = 303;
    const int RowDown = 0, RowLeft = 1, RowRight = 2, RowUp = 3;

    static readonly Color FloorColor = new Color32(185, 176, 207, 255);
    static readonly Color WallColor = new Color32(135, 120, 166, 255);
    static readonly Color BgColor = new Color32(7, 4, 11, 255);   // obscurité au-dessus des murs

    Sprite[,] frames = new Sprite[4, 4];
    Transform player, billboard;
    SpriteRenderer body;
    Camera cam;
    Vector3 pos = new Vector3(0f, 0f, -5f);
    float facing;                 // angle (degrés) de la direction regardée, autour de Y
    float yaw = 0f, pitch = 20f, dist = 5.5f, animT;
    float vy;                     // vitesse verticale (saut)
    float ground;                 // hauteur du sol sous l'avatar (0 ou dessus d'un banc)
    Transform shadowBlob;

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
        BuildFountain();
        BuildPlayground();
        BuildAvatar();
        UpdateCameraAndAvatar(false);
    }

    void BuildRoom()
    {
        var brick = LoadTiled("tex_brick");
        var paving = LoadTiled("tex_floor");
        // la mise à l'échelle des textures suit la taille de la face visible : 1 répétition tous les 2 m
        Box("Floor", new Vector3(0f, -0.05f, 0f), new Vector3(Room, 0.1f, Room), FloorColor, paving, new Vector2(Room / Tile, Room / Tile));
        BuildWall("Wall N", new Vector3(0f, 0f, Half), 180f, brick);
        BuildWall("Wall S", new Vector3(0f, 0f, -Half), 0f, brick);
        BuildWall("Wall W", new Vector3(-Half, 0f, 0f), 90f, brick, true);    // fenêtres sur les deux murs parallèles
        BuildWall("Wall E", new Vector3(Half, 0f, 0f), -90f, brick, true);

        // voile noir dégradé devant chaque mur : transparent en bas, noir en haut (pas de plafond visible)
        var fade = MakeFadeSprite();
        // voile posé juste devant les piliers et la corniche, pour les assombrir aussi
        float f = Half - PillarOut - 0.08f;
        Fade(fade, new Vector3(0f, 0f, f), 180f);
        Fade(fade, new Vector3(0f, 0f, -f), 0f);
        Fade(fade, new Vector3(f, 0f, 0f), -90f);
        Fade(fade, new Vector3(-f, 0f, 0f), 90f);

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

    void BuildWall(string name, Vector3 position, float yRot, Texture2D brick, bool windows = false)
    {
        var root = new GameObject(name).transform;
        root.position = position;
        root.rotation = Quaternion.Euler(0f, yRot, 0f);   // z local -> intérieur de la pièce
        Vector3 into = Vector3.forward;

        // surface du mur avec les ouvertures découpées (UV en mètres : briques continues, jamais étirées)
        // chaque ouverture : centre x, rayon, bas, naissance de l'arc
        var openings = new System.Collections.Generic.List<Vector4>();
        foreach (float cx in ArchX) openings.Add(new Vector4(cx, AR, 0f, ArchH));
        if (windows) foreach (float cx in WinX) openings.Add(new Vector4(cx, WR, WinBottom, WinSpring));
        openings.Sort((p, q) => p.x.CompareTo(q.x));
        var wall = new MeshBuilder();
        float x = -Half;
        foreach (var o in openings)
        {
            float cx = o.x, r = o.y, bottom = o.z, spring = o.w;
            wall.WallRect(x, 0f, cx - r, WallH, 0f, into);                 // plein mur jusqu'à l'ouverture
            wall.WallRect(cx - r, 0f, cx + r, bottom, 0f, into);           // sous l'ouverture (fenêtre)
            wall.WallRect(cx - r, spring + r, cx + r, WallH, 0f, into);    // au-dessus de l'arc
            const int slices = 24;
            for (int k = 0; k < slices; k++)                                // écoinçons autour de l'arc
            {
                float y0 = spring + k * r / slices, y1 = y0 + r / slices;
                float w0 = Mathf.Sqrt(Mathf.Max(0f, r * r - (y0 - spring) * (y0 - spring)));
                wall.WallRect(cx - r, y0, cx - w0, y1, 0f, into);
                wall.WallRect(cx + w0, y0, cx + r, y1, 0f, into);
            }
            x = cx + r;
        }
        wall.WallRect(x, 0f, Half, WallH, 0f, into);
        AddMesh(root, "Bricks", wall, NewMaterial(brick != null ? Color.white : WallColor, brick));

        Color32[] stones = { new Color32(207, 198, 223, 255), new Color32(197, 186, 216, 255), new Color32(214, 206, 229, 255), new Color32(194, 184, 214, 255) };
        var nicheMat = NewMaterial(new Color32(143, 134, 168, 255), brick);
        if (windows) foreach (float wx in WinX) BuildWindow(root, wx, nicheMat, stones);
        int ai = 0;
        foreach (float cx in ArchX)
        {
            // alcôve : fond, côtés et voûte, tournés vers l'intérieur
            var niche = new MeshBuilder();
            float zb = -ArchDepth;
            niche.WallRect(cx - AR, 0f, cx + AR, ArchH, zb, into);
            const int seg = 20;
            Vector3 c0 = new Vector3(cx, ArchH, 0f);
            for (int i = 0; i < seg; i++)
            {
                float a0 = Mathf.PI * i / seg, a1 = Mathf.PI * (i + 1) / seg;
                Vector3 p0 = c0 + new Vector3(Mathf.Cos(a0) * AR, Mathf.Sin(a0) * AR, 0f);
                Vector3 p1 = c0 + new Vector3(Mathf.Cos(a1) * AR, Mathf.Sin(a1) * AR, 0f);
                Vector3 back = Vector3.forward * zb, cb = c0 + back;
                niche.Tri(cb, p0 + back, p1 + back, into, UVxy(cb), UVxy(p0), UVxy(p1));               // fond (demi-disque)
                Vector3 inward = c0 - (p0 + p1) * 0.5f; inward.z = 0f;
                float s0 = a0 * AR / Tile, s1 = a1 * AR / Tile;
                niche.Quad(p0 + back, p1 + back, p1, p0, inward,
                    new Vector2(s0, zb / Tile), new Vector2(s1, zb / Tile), new Vector2(s1, 0f), new Vector2(s0, 0f));   // voûte
            }
            foreach (float sx in new[] { cx - AR, cx + AR })
            {
                Vector3 n = new Vector3(sx < cx ? 1f : -1f, 0f, 0f);
                niche.Quad(new Vector3(sx, 0f, zb), new Vector3(sx, 0f, 0f), new Vector3(sx, ArchH, 0f), new Vector3(sx, ArchH, zb), n,
                    new Vector2(zb / Tile, 0f), Vector2.zero, new Vector2(0f, ArchH / Tile), new Vector2(zb / Tile, ArchH / Tile));
            }
            AddMesh(root, "Niche", niche, nicheMat);
            LocalCube(root, "Step", new Vector3(cx, 0.11f, zb / 2f), new Vector3(ArchW, 0.22f, ArchDepth), stones[3]);

            // encadrement : montants alternés, socles, claveaux en éventail et clé de voûte
            const int rows = 6; const float gap = 0.035f; float bh = ArchH / rows;
            for (int i = 0; i < rows; i++)
            {
                float w = i % 2 == 1 ? 0.42f : 0.62f;
                foreach (float side in new[] { -1f, 1f })
                    LocalCube(root, "Jamb", new Vector3(cx + side * (AR + w / 2f), i * bh + bh / 2f, ArchOut / 2f),
                              new Vector3(w, bh - gap, ArchOut), stones[(i + ai + (side > 0 ? 1 : 0)) % 3]);
            }
            foreach (float side in new[] { -1f, 1f })
                LocalCube(root, "Base", new Vector3(cx + side * (AR + 0.36f), 0.13f, (ArchOut + 0.08f) / 2f), new Vector3(0.78f, 0.26f, ArchOut + 0.08f), stones[2]);
            const int n9 = 9; const float ga = 0.018f;
            for (int i = 0; i < n9; i++)
            {
                bool key = i == (n9 - 1) / 2;
                float a0 = Mathf.PI - i * Mathf.PI / n9 - ga, a1 = Mathf.PI - (i + 1) * Mathf.PI / n9 + ga;
                var mb = new MeshBuilder();
                mb.Sector(c0, AR, AR + ArchRing + (key ? 0.16f : 0f), a1, a0, ArchOut + (key ? 0.06f : 0f));
                AddMesh(root, key ? "Keystone" : "Voussoir", mb, NewMaterial(stones[(i + ai) % 3], null));
            }
            ai++;
        }

        // piliers : base, blocs empilés en alternance, chapiteau
        foreach (float px in PillarX)
        {
            const int rows = 9; const float gap = 0.035f; float bh = (PillarH - 0.6f) / rows;
            LocalCube(root, "Pillar base", new Vector3(px, 0.17f, (PillarOut + 0.1f) / 2f), new Vector3(PillarW + 0.22f, 0.34f, PillarOut + 0.1f), stones[2]);
            for (int i = 0; i < rows; i++)
            {
                float w = i % 2 == 1 ? PillarW - 0.08f : PillarW;
                LocalCube(root, "Pillar", new Vector3(px, 0.34f + i * bh + bh / 2f, PillarOut / 2f), new Vector3(w, bh - gap, PillarOut), stones[i % 3]);
            }
            LocalCube(root, "Capital", new Vector3(px, PillarH - 0.13f, (PillarOut + 0.12f) / 2f), new Vector3(PillarW + 0.24f, 0.26f, PillarOut + 0.12f), stones[2]);
        }

        // soubassement : dalles au pied du mur, interrompues par les arches et les piliers
        bool Free(float xx)
        {
            foreach (float cx in ArchX) if (xx > cx - AR - 0.75f && xx < cx + AR + 0.75f) return false;
            foreach (float px in PillarX) if (xx > px - 0.46f && xx < px + 0.46f) return false;
            return true;
        }
        const float step = 0.05f;
        float? start = null;
        for (float xx = -Half; xx <= Half + 1e-4f; xx += step)
        {
            bool ok = xx < Half - 1e-4f && Free(xx + step / 2f);
            if (ok && start == null) start = xx;
            if (!ok && start != null)
            {
                float len = xx - start.Value; int n = Mathf.Max(1, Mathf.RoundToInt(len / 1.1f)); float bl = len / n;
                for (int i = 0; i < n; i++)
                    LocalCube(root, "Plinth", new Vector3(start.Value + bl * (i + 0.5f), PlinthH / 2f, PlinthOut / 2f), new Vector3(bl - 0.035f, PlinthH, PlinthOut), stones[i % 3]);
                start = null;
            }
        }
        // corniche au-dessus des arches
        const int cn = 16; float cl = Room / cn;
        for (int i = 0; i < cn; i++)
            LocalCube(root, "Cornice", new Vector3(-Half + cl * (i + 0.5f), CorniceY, CorniceOut / 2f), new Vector3(cl - 0.035f, CorniceH, CorniceOut), stones[i % 3]);
    }

    void BuildWindow(Transform root, float cx, Material revealMat, Color32[] stones)
    {
        Vector3 into = Vector3.forward;
        float zb = -WinDepth, top = WinSpring + WR;
        // tableau : côtés, appui intérieur et voûte, tournés vers l'ouverture
        var reveal = new MeshBuilder();
        Vector3 c0 = new Vector3(cx, WinSpring, 0f);
        const int seg = 16;
        for (int i = 0; i < seg; i++)
        {
            float a0 = Mathf.PI * i / seg, a1 = Mathf.PI * (i + 1) / seg;
            Vector3 p0 = c0 + new Vector3(Mathf.Cos(a0) * WR, Mathf.Sin(a0) * WR, 0f);
            Vector3 p1 = c0 + new Vector3(Mathf.Cos(a1) * WR, Mathf.Sin(a1) * WR, 0f);
            Vector3 back = Vector3.forward * zb;
            Vector3 inward = c0 - (p0 + p1) * 0.5f; inward.z = 0f;
            reveal.Quad(p0 + back, p1 + back, p1, p0, inward, Vector2.zero, Vector2.right, Vector2.one, Vector2.up);
        }
        foreach (float sx in new[] { cx - WR, cx + WR })
        {
            Vector3 n = new Vector3(sx < cx ? 1f : -1f, 0f, 0f);
            reveal.Quad(new Vector3(sx, WinBottom, zb), new Vector3(sx, WinBottom, 0f), new Vector3(sx, WinSpring, 0f), new Vector3(sx, WinSpring, zb), n,
                Vector2.zero, Vector2.right, Vector2.one, Vector2.up);
        }
        reveal.Quad(new Vector3(cx - WR, WinBottom, zb), new Vector3(cx + WR, WinBottom, zb), new Vector3(cx + WR, WinBottom, 0f), new Vector3(cx - WR, WinBottom, 0f), Vector3.up,
            Vector2.zero, Vector2.right, Vector2.one, Vector2.up);
        AddMesh(root, "Window reveal", reveal, revealMat);

        // vitrage lumineux (clair de lune) au fond
        var glass = new MeshBuilder();
        Vector3 gz = Vector3.forward * (zb + 0.02f);
        glass.Quad(new Vector3(cx - WR, WinBottom, 0f) + gz, new Vector3(cx + WR, WinBottom, 0f) + gz, new Vector3(cx + WR, WinSpring, 0f) + gz, new Vector3(cx - WR, WinSpring, 0f) + gz, into,
            Vector2.zero, Vector2.right, Vector2.one, Vector2.up);
        for (int i = 0; i < seg; i++)
        {
            float a0 = Mathf.PI * i / seg, a1 = Mathf.PI * (i + 1) / seg;
            glass.Tri(c0 + gz, c0 + gz + new Vector3(Mathf.Cos(a0), Mathf.Sin(a0), 0f) * WR, c0 + gz + new Vector3(Mathf.Cos(a1), Mathf.Sin(a1), 0f) * WR, into, Vector2.zero, Vector2.zero, Vector2.zero);
        }
        var glassMat = NewMaterial(new Color32(169, 194, 240, 255), null);
        glassMat.EnableKeyword("_EMISSION");
        glassMat.SetColor("_EmissionColor", new Color32(150, 175, 225, 255));
        AddMesh(root, "Window glass", glass, glassMat);

        // croisillons
        Color32 lead = new Color32(94, 84, 120, 255);
        float zc = zb + 0.05f;
        LocalCube(root, "Mullion", new Vector3(cx, (WinBottom + top) / 2f, zc), new Vector3(0.07f, top - WinBottom, 0.05f), lead);
        LocalCube(root, "Transom", new Vector3(cx, WinSpring, zc), new Vector3(WinW, 0.07f, 0.05f), lead);
        LocalCube(root, "Transom", new Vector3(cx, (WinBottom + WinSpring) / 2f, zc), new Vector3(WinW, 0.06f, 0.05f), lead);

        // encadrement : montants alternés, appui saillant, claveaux et clé de voûte
        const int rows = 4; const float gap = 0.03f; float bh = (WinSpring - WinBottom) / rows;
        for (int i = 0; i < rows; i++)
        {
            float w = i % 2 == 1 ? 0.22f : 0.32f;
            foreach (float side in new[] { -1f, 1f })
                LocalCube(root, "Window jamb", new Vector3(cx + side * (WR + w / 2f), WinBottom + i * bh + bh / 2f, WinOut / 2f),
                          new Vector3(w, bh - gap, WinOut), stones[(i + (side > 0 ? 1 : 0)) % 3]);
        }
        LocalCube(root, "Sill", new Vector3(cx, WinBottom - 0.08f, (WinOut + 0.16f) / 2f), new Vector3(WinW + 0.8f, 0.16f, WinOut + 0.16f), stones[2]);
        LocalCube(root, "Under sill", new Vector3(cx, WinBottom - 0.23f, WinOut / 2f), new Vector3(WinW + 0.4f, 0.14f, WinOut), stones[3]);
        const int n7 = 7; const float ga = 0.018f;
        for (int i = 0; i < n7; i++)
        {
            bool key = i == (n7 - 1) / 2;
            float a0 = Mathf.PI - i * Mathf.PI / n7 - ga, a1 = Mathf.PI - (i + 1) * Mathf.PI / n7 + ga;
            var mb = new MeshBuilder();
            mb.Sector(c0, WR, WR + WinRing + (key ? 0.1f : 0f), a1, a0, WinOut + (key ? 0.05f : 0f));
            AddMesh(root, key ? "Window keystone" : "Window voussoir", mb, NewMaterial(stones[i % 3], null));
        }

        // lumière froide qui entre par la fenêtre
        var l = new GameObject("Window light").AddComponent<Light>();
        l.type = LightType.Point;
        l.color = new Color32(159, 182, 255, 255);
        l.range = 8f;
        l.intensity = 0.9f;
        l.transform.SetParent(root, false);
        l.transform.localPosition = new Vector3(cx, WinSpring, 0.9f);
    }

    void BuildFountain()
    {
        var root = new GameObject("Fountain").transform;
        Color32[] stones = { new Color32(207, 198, 223, 255), new Color32(197, 186, 216, 255), new Color32(214, 206, 229, 255), new Color32(194, 184, 214, 255) };

        // grand bassin : socle, deux rangées de blocs décalées, margelle
        StoneRing(root, BasinIn - 0.05f, BasinOut + 0.12f, 0f, 0.12f, 16, 0f, stones, 3);
        StoneRing(root, BasinIn, BasinOut, 0.12f, 0.2f, 14, 0f, stones, 0);
        StoneRing(root, BasinIn, BasinOut, 0.32f, 0.2f, 14, 0.5f, stones, 1);
        StoneRing(root, BasinIn - 0.06f, BasinOut + 0.06f, 0.52f, 0.11f, 12, 0f, stones, 2);
        Disk(root, "Basin floor", BasinIn, 0.02f, 0.3f, stones[3]);
        // colonnes et vasques
        Disk(root, "Column", 0.3f, 0.3f, 1.2f, stones[0]);
        Disk(root, "Bowl 1", Bowl1R, Bowl1Y, Bowl1Y + 0.22f, stones[2]);
        Disk(root, "Column 2", 0.16f, Bowl1Y + 0.2f, Bowl2Y, stones[1]);
        Disk(root, "Bowl 2", Bowl2R, Bowl2Y, Bowl2Y + 0.16f, stones[0]);
        Disk(root, "Finial", 0.08f, Bowl2Y + 0.1f, SpoutY, stones[2]);

        // eau (légèrement lumineuse)
        var water = NewMaterial(new Color32(63, 127, 214, 255), null);
        water.EnableKeyword("_EMISSION");
        water.SetColor("_EmissionColor", new Color32(22, 64, 126, 255));
        foreach (var (r, y) in new[] { (BasinIn, Water0), (Bowl1R - 0.1f, Bowl1Y + 0.23f), (Bowl2R - 0.07f, Bowl2Y + 0.17f) })
            Disk(root, "Water", r, y - 0.01f, y, Color.white).GetComponent<Renderer>().sharedMaterial = water;

        // gouttes : jet au sommet qui retombe dans les vasques
        var ps = new GameObject("Fountain water").AddComponent<ParticleSystem>();
        ps.transform.SetParent(root, false);
        ps.transform.localPosition = new Vector3(0f, SpoutY, 0f);
        ps.transform.localRotation = Quaternion.Euler(-90f, 0f, 0f);   // émission vers le haut
        var main = ps.main;
        main.startSpeed = new ParticleSystem.MinMaxCurve(1.5f, 2.1f);
        main.startLifetime = 1.4f;
        main.startSize = 0.05f;
        main.gravityModifier = 1f;
        main.maxParticles = 800;
        main.startColor = new Color(0.81f, 0.91f, 1f, 0.85f);
        var em = ps.emission; em.rateOverTime = 400f;
        var shape = ps.shape; shape.shapeType = ParticleSystemShapeType.Cone; shape.angle = 28f; shape.radius = 0.03f;
        var col = ps.collision;                                    // les gouttes rebondissent sur les vasques et l'eau
        col.enabled = true; col.type = ParticleSystemCollisionType.World; col.bounce = 0.05f; col.lifetimeLoss = 0.4f;
    }

    // anneau de blocs de pierre posés en cercle
    static void StoneRing(Transform root, float r1, float r2, float y, float h, int n, float offset, Color32[] stones, int shade0)
    {
        float ga = 0.012f;
        for (int i = 0; i < n; i++)
        {
            float a0 = (i + offset) * Mathf.PI * 2f / n + ga, a1 = (i + 1 + offset) * Mathf.PI * 2f / n - ga;
            var mb = new MeshBuilder();
            mb.FlatSector(r1, r2, a0, a1, y, h);
            AddMesh(root, "Fountain stone", mb, NewMaterial(stones[(i + shade0) % stones.Length], null));
        }
    }

    // disque plein (cylindre) entre y0 et y1, avec collisionneur pour les gouttes
    static GameObject Disk(Transform root, string name, float r, float y0, float y1, Color color)
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        go.name = name;
        go.transform.SetParent(root, false);
        go.transform.localPosition = new Vector3(0f, (y0 + y1) / 2f, 0f);
        go.transform.localScale = new Vector3(r * 2f, Mathf.Max(0.001f, (y1 - y0) / 2f), r * 2f);
        go.GetComponent<Renderer>().material.color = color;
        Destroy(go.GetComponent<Collider>());
        go.AddComponent<MeshCollider>().convex = true;
        return go;
    }

    static void LocalPrimitive(Transform root, PrimitiveType type, string name, Vector3 pos, Vector3 size, Color color)
    {
        var go = GameObject.CreatePrimitive(type);
        go.name = name;
        Destroy(go.GetComponent<Collider>());
        go.transform.SetParent(root, false);
        go.transform.localPosition = pos;
        go.transform.localScale = size;
        go.GetComponent<Renderer>().material.color = color;
    }

    // ---------- Cour de récréation ----------
    void BuildPlayground()
    {
        var root = new GameObject("Playground").transform;
        Color32[] wood = { new Color32(154, 106, 62, 255), new Color32(143, 96, 56, 255), new Color32(164, 114, 70, 255) };
        Color32 woodDark = new Color32(106, 66, 38, 255);

        // 4 bancs le long des murs du fond et de devant, entre les piliers
        foreach (var (cx, cz) in new[] { (-6.5f, -Half + 1.25f), (6.5f, -Half + 1.25f), (-6.5f, Half - 1.25f), (6.5f, Half - 1.25f) })
        {
            var b = new GameObject("Bench").transform; b.SetParent(root, false); b.localPosition = new Vector3(cx, 0f, cz);
            for (int i = 0; i < 3; i++) LocalCube(b, "Plank", new Vector3(0f, BenchSeat, -0.16f + i * 0.16f), new Vector3(BenchLen, 0.05f, 0.14f), wood[i]);
            foreach (float sx in new[] { -0.92f, 0.92f })
            {
                LocalCube(b, "Leg", new Vector3(sx, (BenchSeat - 0.025f) / 2f, 0f), new Vector3(0.09f, BenchSeat - 0.025f, 0.4f), woodDark);
                LocalCube(b, "Rail", new Vector3(sx, BenchSeat - 0.06f, 0f), new Vector3(0.1f, 0.06f, 0.48f), woodDark);
            }
            LocalCube(b, "Stretcher", new Vector3(0f, 0.14f, 0f), new Vector3(1.84f, 0.06f, 0.06f), woodDark);
            Solid(b, new Vector3(0f, BenchSeat / 2f, 0f), new Vector3(BenchLen, BenchSeat + 0.05f, BenchDepth));   // pour le ballon
            obstacles.Add(new Obstacle { minX = cx - BenchLen / 2f, maxX = cx + BenchLen / 2f, minZ = cz - BenchDepth / 2f, maxZ = cz + BenchDepth / 2f, top = BenchSeat + 0.025f, standable = true });
        }

        // bascule inclinée avec sièges et poignées
        {
            float cx = -5.5f, cz = -4.5f, L = 3.4f, pivotY = 0.5f;
            var b = new GameObject("Seesaw").transform; b.SetParent(root, false); b.localPosition = new Vector3(cx, 0f, cz);
            LocalCube(b, "Base", new Vector3(0f, 0.18f, 0f), new Vector3(0.34f, 0.36f, 0.5f), woodDark);
            LocalCube(b, "Axle", new Vector3(0f, pivotY - 0.06f, 0f), new Vector3(0.16f, 0.16f, 0.62f), wood[0]);
            var plank = new GameObject("Plank").transform; plank.SetParent(b, false);
            plank.localPosition = new Vector3(0f, pivotY, 0f); plank.localRotation = Quaternion.Euler(0f, 0f, 10f);
            LocalCube(plank, "Board", new Vector3(0f, 0.035f, 0f), new Vector3(L, 0.07f, 0.34f), wood[2]);
            foreach (float sx in new[] { -1f, 1f })
            {
                LocalCube(plank, "Seat", new Vector3(sx * (L / 2f - 0.3f), 0.1f, 0f), new Vector3(0.4f, 0.06f, 0.36f), wood[1]);
                LocalCube(plank, "Handle", new Vector3(sx * (L / 2f - 0.62f), 0.24f, -0.12f), new Vector3(0.06f, 0.34f, 0.06f), woodDark);
                LocalCube(plank, "Handle", new Vector3(sx * (L / 2f - 0.62f), 0.24f, 0.12f), new Vector3(0.06f, 0.34f, 0.06f), woodDark);
                LocalCube(plank, "Handle bar", new Vector3(sx * (L / 2f - 0.62f), 0.42f, 0f), new Vector3(0.06f, 0.06f, 0.3f), woodDark);
            }
            Solid(b, new Vector3(0f, 0.5f, 0f), new Vector3(L, 1f, 0.5f));
            obstacles.Add(new Obstacle { minX = cx - L / 2f, maxX = cx + L / 2f, minZ = cz - 0.25f, maxZ = cz + 0.25f, top = 99f, standable = false });
        }

        // marelle à la craie (le « CIEL » vers la fontaine)
        var hopTex = Resources.Load<Texture2D>("tex_hopscotch");
        if (hopTex != null)
        {
            hopTex.filterMode = FilterMode.Point;
            var sr = new GameObject("Hopscotch").AddComponent<SpriteRenderer>();
            sr.sprite = Sprite.Create(hopTex, new Rect(0, 0, hopTex.width, hopTex.height), new Vector2(0.5f, 0.5f), 64f);   // 64 px par mètre
            sr.transform.SetParent(root, false);
            sr.transform.localPosition = new Vector3(5.5f, 0.006f, -4.4f);
            sr.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);   // à plat, le haut de l'image vers la fontaine
        }

        // murs invisibles pour le ballon (devant le soubassement)
        float wl = Half - 0.45f;
        Solid(root, new Vector3(0f, 1f, wl + 0.5f), new Vector3(Room, 2f, 1f));
        Solid(root, new Vector3(0f, 1f, -wl - 0.5f), new Vector3(Room, 2f, 1f));
        Solid(root, new Vector3(wl + 0.5f, 1f, 0f), new Vector3(1f, 2f, Room));
        Solid(root, new Vector3(-wl - 0.5f, 1f, 0f), new Vector3(1f, 2f, Room));
        var basin = GameObject.CreatePrimitive(PrimitiveType.Cylinder);            // bord de la fontaine
        basin.name = "Basin collider"; basin.transform.SetParent(root, false);
        basin.transform.localPosition = new Vector3(0f, 0.32f, 0f); basin.transform.localScale = new Vector3((BasinOut + 0.1f) * 2f, 0.32f, (BasinOut + 0.1f) * 2f);
        Destroy(basin.GetComponent<Collider>()); basin.AddComponent<MeshCollider>().convex = true;
        basin.GetComponent<Renderer>().enabled = false;

        // ballon rayé : roule, rebondit, on le pousse en marchant dessus
        var bg = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        bg.name = "Ball"; bg.transform.SetParent(root, false);
        bg.transform.localPosition = new Vector3(-2.5f, BallR, -6f); bg.transform.localScale = Vector3.one * BallR * 2f;
        var bt = new Texture2D(32, 16) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Repeat };
        Color32[] stripes = { new Color32(216, 67, 59, 255), new Color32(242, 239, 230, 255), new Color32(59, 111, 216, 255), new Color32(242, 239, 230, 255) };
        for (int y = 0; y < 16; y++) for (int x = 0; x < 32; x++)
            bt.SetPixel(x, y, (y < 2 || y > 13) ? (Color)new Color32(246, 210, 74, 255) : (Color)stripes[(x / 4) % 4]);
        bt.Apply();
        var bm = bg.GetComponent<Renderer>().material; bm.mainTexture = bt; bm.color = Color.white;
        var pm = new PhysicMaterial("Ball") { bounciness = 0.55f, dynamicFriction = 0.4f, staticFriction = 0.4f, bounceCombine = PhysicMaterialCombine.Maximum };
        bg.GetComponent<Collider>().material = pm;
        ball = bg.AddComponent<Rigidbody>();
        ball.mass = 0.4f;
        ball.interpolation = RigidbodyInterpolation.Interpolate;
        ball.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
    }

    // collisionneur invisible (boîte)
    static void Solid(Transform parent, Vector3 localPos, Vector3 size)
    {
        var go = new GameObject("Collider");
        go.transform.SetParent(parent, false);
        go.transform.localPosition = localPos;
        go.AddComponent<BoxCollider>().size = size;
    }

    void KickBall(bool moving)
    {
        kickCooldown -= Time.deltaTime;
        if (ball == null || kickCooldown > 0f) return;
        Vector3 d = ball.position - pos; d.y = 0f;
        float reach = PlayerR + BallR + 0.08f;
        if (d.magnitude < reach && ball.position.y - BallR < pos.y + 0.6f)
        {
            Vector3 n = d.sqrMagnitude > 1e-6f ? d.normalized : Vector3.forward;
            Vector3 v = n * (moving ? 6.5f : 2.5f) + Vector3.up * (moving ? 2.6f : 1.2f);
#if UNITY_6000_0_OR_NEWER
            ball.linearVelocity = v;
#else
            ball.velocity = v;
#endif
            kickCooldown = 0.25f;
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
        // bloc en secteur d'anneau posé à plat (pour les pierres rondes de la fontaine)
        public void FlatSector(float r1, float r2, float aStart, float aEnd, float y, float h)
        {
            const int n = 4;
            float am = (aStart + aEnd) / 2f, rm = (r1 + r2) / 2f;
            Vector3 mid = new Vector3(Mathf.Cos(am) * rm, y + h / 2f, Mathf.Sin(am) * rm);
            Vector3 P(float a, float r, float yy) => new Vector3(Mathf.Cos(a) * r, yy, Mathf.Sin(a) * r);
            for (int i = 0; i < n; i++)
            {
                float a0 = Mathf.Lerp(aStart, aEnd, i / (float)n), a1 = Mathf.Lerp(aStart, aEnd, (i + 1) / (float)n);
                Face(P(a0, r1, y + h), P(a1, r1, y + h), P(a1, r2, y + h), P(a0, r2, y + h), mid);   // dessus
                Face(P(a0, r1, y), P(a1, r1, y), P(a1, r1, y + h), P(a0, r1, y + h), mid);           // intérieur
                Face(P(a0, r2, y), P(a1, r2, y), P(a1, r2, y + h), P(a0, r2, y + h), mid);           // extérieur
            }
            Face(P(aStart, r1, y), P(aStart, r2, y), P(aStart, r2, y + h), P(aStart, r1, y + h), mid);
            Face(P(aEnd, r1, y), P(aEnd, r2, y), P(aEnd, r2, y + h), P(aEnd, r1, y + h), mid);
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
        shadowBlob = blob.transform;
        blob.transform.localPosition = new Vector3(0f, 0.005f, 0f);
        blob.transform.localScale = new Vector3(0.64f, 0.002f, 0.45f);
        var br = blob.GetComponent<Renderer>();
        br.material.color = new Color32(40, 24, 56, 255);
        br.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
    }

    void ReadInput(out Vector2 move, out Vector2 look, out float zoom, out bool jump)
    {
        move = Vector2.zero; look = Vector2.zero; zoom = 0f; jump = false;
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
            if (kb.spaceKey.wasPressedThisFrame) jump = true;
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
            if (pad.buttonSouth.wasPressedThisFrame) jump = true;
            look += pad.rightStick.ReadValue() * 150f * Time.deltaTime;
        }
#else
        move = new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
        if (Input.GetMouseButton(0) || Input.GetMouseButton(1))
            look = new Vector2(Input.GetAxis("Mouse X"), Input.GetAxis("Mouse Y")) * 4f;
        zoom = Input.mouseScrollDelta.y * 0.2f;
        jump = Input.GetKeyDown(KeyCode.Space) || Input.GetButtonDown("Jump");
#endif
        move = Vector2.ClampMagnitude(move, 1f);
    }

    void Update()
    {
        if (player == null) return;
        ReadInput(out var move, out var look, out var zoom, out var jump);
        yaw += look.x;
        pitch = Mathf.Clamp(pitch - look.y, 3f, 70f);
        dist = Mathf.Clamp(dist * (1f - zoom), 2.5f, 10f);

        bool moving = move.sqrMagnitude > 0.0025f;
        if (moving)
        {
            // avant = direction de la caméra à plat
            var rot = Quaternion.Euler(0f, yaw, 0f);
            Vector3 dir = rot * new Vector3(move.x, 0f, move.y);
            float lim = Half - WallClear;   // l'avatar reste devant les piliers et les arches
            pos.x = Mathf.Clamp(pos.x + dir.x * Speed * Time.deltaTime, -lim, lim);
            pos.z = Mathf.Clamp(pos.z + dir.z * Speed * Time.deltaTime, -lim, lim);
            // on fait le tour de la fontaine sans la traverser
            var flat = new Vector2(pos.x, pos.z);
            if (flat.magnitude < FountainCollide) { flat = (flat.sqrMagnitude > 1e-6f ? flat.normalized : Vector2.up) * FountainCollide; pos.x = flat.x; pos.z = flat.y; }
            foreach (var o in obstacles)                 // contourner les bancs (sauf si on est dessus) et la bascule
            {
                if (o.standable && pos.y >= o.top - 0.12f) continue;
                float x0 = o.minX - PlayerR, x1 = o.maxX + PlayerR, z0 = o.minZ - PlayerR, z1 = o.maxZ + PlayerR;
                if (pos.x > x0 && pos.x < x1 && pos.z > z0 && pos.z < z1)
                {
                    float[] pen = { pos.x - x0, x1 - pos.x, pos.z - z0, z1 - pos.z };
                    int i = 0; for (int k = 1; k < 4; k++) if (pen[k] < pen[i]) i = k;
                    if (i == 0) pos.x = x0; else if (i == 1) pos.x = x1; else if (i == 2) pos.z = z0; else pos.z = z1;
                }
            }
            facing = Mathf.Atan2(dir.x, dir.z) * Mathf.Rad2Deg;
            animT += Time.deltaTime;
        }
        else animT = 0f;

        // saut : impulsion si l'avatar touche le sol, puis gravité
        // hauteur du sol sous l'avatar : pavés, ou dessus d'un banc
        ground = 0f;
        foreach (var o in obstacles)
            if (o.standable && pos.x > o.minX - 0.1f && pos.x < o.maxX + 0.1f && pos.z > o.minZ - 0.1f && pos.z < o.maxZ + 0.1f && pos.y >= o.top - 0.12f)
                ground = Mathf.Max(ground, o.top);
        if (jump && pos.y <= ground + 1e-3f) vy = JumpSpeed;
        vy -= Gravity * Time.deltaTime;
        pos.y += vy * Time.deltaTime;
        if (pos.y < ground) { pos.y = ground; vy = 0f; }
        KickBall(moving);
        UpdateCameraAndAvatar(moving);
    }

    void UpdateCameraAndAvatar(bool moving)
    {
        if (player == null) return;
        player.position = pos;

        // caméra en orbite autour de l'avatar, gardée dans la pièce
        Vector3 target = new Vector3(pos.x, 1.1f + pos.y * 0.5f, pos.z);   // la caméra suit un peu le saut
        Vector3 camPos = target + Quaternion.Euler(pitch, yaw, 0f) * new Vector3(0f, 0f, -dist);
        float m = Half - 0.45f;   // la caméra ne rentre pas dans les piliers
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
        bool airborne = pos.y > ground + 1e-3f;
        int col = airborne ? 1 : moving ? Mathf.FloorToInt(animT * 8f) % 4 : 0;   // en l'air : jambes écartées
        if (shadowBlob != null)   // l'ombre reste au sol et rétrécit en hauteur
        {
            float sh = 1f / (1f + (pos.y - ground) * 0.7f);
            shadowBlob.localPosition = new Vector3(0f, ground + 0.005f - pos.y, 0f);
            shadowBlob.localScale = new Vector3(0.64f * sh, 0.002f, 0.45f * sh);
        }
        body.sprite = frames[row, col];
    }
}
