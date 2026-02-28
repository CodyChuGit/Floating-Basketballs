import fs from 'fs';
const data = fs.readFileSync('/Users/cody/react-3d-model/public/Ball.gltf', 'utf8');
const gltf = JSON.parse(data);
console.log("Nodes:", gltf.nodes);
console.log("Meshes:", gltf.meshes);
