const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const D = process.argv[2], OUT = '/home/user/Unity/Assets/Export';
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.setContent('<body style="margin:0"><canvas id="c" width="1000" height="700"></canvas></body>');
  for (const f of [D + '/cdn/three.min.js', D + '/npmthree/package/examples/js/exporters/GLTFExporter.js', D + '/npmthree/package/examples/js/loaders/GLTFLoader.js', '/home/user/Unity/Tools/models/grande_salle.js']) await pg.addScriptTag({ path: f });
  const res = await pg.evaluate(() => new Promise(done => {
    new THREE.GLTFExporter().parse(buildHall(), buf => {
      new THREE.GLTFLoader().parse(buf, '', gltf => {            // relecture du fichier + mesure + aperçu
        const bb = new THREE.Box3().setFromObject(gltf.scene);
        const r = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true }); r.outputEncoding = THREE.sRGBEncoding;
        const sc = new THREE.Scene(); sc.background = new THREE.Color(0xdfe4ea); sc.add(gltf.scene, new THREE.HemisphereLight(0xffffff, 0x777777, 0.8));
        const dl = new THREE.DirectionalLight(0xffffff, 0.7); dl.position.set(300, 500, 200); sc.add(dl);
        const cam = new THREE.PerspectiveCamera(45, 10 / 7, 1, 3000); cam.position.set(330, 420, 380); cam.lookAt(0, 60, 0); r.render(sc, cam);
        const u8 = new Uint8Array(buf); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        done({ glb: btoa(s), min: bb.min.toArray(), max: bb.max.toArray() });
      });
    }, { binary: true });
  }));
  fs.writeFileSync(OUT + '/grande_salle.glb', Buffer.from(res.glb, 'base64'));
  await pg.screenshot({ path: OUT + '/grande_salle_apercu.png' });
  console.log('boite', JSON.stringify(res.min), JSON.stringify(res.max), 'errors', errs); await b.close();
})();
