using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

/// <summary>
/// Prototype 3D : pièce carrée vide (sol, 4 murs, plafond, lumière) et avatar vu à la 3e personne.
/// - ZQSD / WASD (ou stick gauche) : se déplacer par rapport à la caméra
/// - Souris en maintenant un bouton, flèches ← → (ou stick droit) : tourner la caméra ; molette : zoom
/// L'avatar est un sprite 2D toujours tourné vers la caméra ; l'image (face / dos / profil) dépend de l'angle de vue.
/// Se lance tout seul quand on appuie sur Play, dans n'importe quelle scène.
/// Image attendue : Assets/Resources/avatar_sheet.png (688x1212, images de 172x303).
/// </summary>
public class RoomPrototype : MonoBehaviour
{
    public static bool AutoStart = true;

    // Réglages (mêmes valeurs que Tools/web/game.js)
    const float Room = 20f, Half = Room / 2f, WallH = 4f, WallT = 0.4f;
    const float Speed = 4.2f, AvatarHeight = 1.7f;
    const int FrameW = 172, FrameH = 303;
    const int RowDown = 0, RowLeft = 1, RowRight = 2, RowUp = 3;

    static readonly Color FloorColor = new Color32(185, 176, 207, 255);
    static readonly Color WallColor = new Color32(135, 120, 166, 255);
    static readonly Color CeilingColor = new Color32(78, 65, 104, 255);
    static readonly Color BgColor = new Color32(29, 21, 38, 255);

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
        Box("Floor", new Vector3(0f, -0.05f, 0f), new Vector3(Room, 0.1f, Room), FloorColor);
        Box("Ceiling", new Vector3(0f, WallH + 0.05f, 0f), new Vector3(Room, 0.1f, Room), CeilingColor);
        Box("Wall N", new Vector3(0f, WallH / 2f, Half + WallT / 2f), new Vector3(Room + WallT * 2f, WallH, WallT), WallColor);
        Box("Wall S", new Vector3(0f, WallH / 2f, -Half - WallT / 2f), new Vector3(Room + WallT * 2f, WallH, WallT), WallColor);
        Box("Wall E", new Vector3(Half + WallT / 2f, WallH / 2f, 0f), new Vector3(WallT, WallH, Room), WallColor);
        Box("Wall W", new Vector3(-Half - WallT / 2f, WallH / 2f, 0f), new Vector3(WallT, WallH, Room), WallColor);

        var lamp = new GameObject("Lamp").AddComponent<Light>();
        lamp.type = LightType.Point;
        lamp.color = new Color32(255, 241, 220, 255);
        lamp.range = 30f;
        lamp.intensity = 2.2f;
        lamp.shadows = LightShadows.Soft;
        lamp.transform.position = new Vector3(0f, WallH - 0.4f, 0f);

        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
        RenderSettings.ambientSkyColor = new Color32(150, 140, 175, 255);
        RenderSettings.ambientEquatorColor = new Color32(120, 108, 150, 255);
        RenderSettings.ambientGroundColor = new Color32(74, 60, 102, 255);
    }

    static void Box(string name, Vector3 center, Vector3 size, Color color)
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
        go.name = name;
        go.transform.position = center;
        go.transform.localScale = size;
        var r = go.GetComponent<Renderer>();
        r.material.color = color;   // matériau par défaut du pipeline, teinté
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
            float lim = Half - 0.35f;
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
