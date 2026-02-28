import fs from 'fs';
const data = fs.readFileSync('/Users/cody/react-3d-model/public/Ball.gltf', 'utf8');
const gltf = JSON.parse(data);
console.log("Materials:", gltf.materials.map(m => m.name));
console.log("PBR:", gltf.materials[0].pbrMetallicRoughness);
