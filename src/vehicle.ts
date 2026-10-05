import * as THREE from 'three';

/** Procedural visualization inspired by the publicly shown two-seat Cybercab. */
export function createCybercab() {
  const group = new THREE.Group();
  const gold = new THREE.MeshPhysicalMaterial({ color: 0xb7a47a, metalness: .86, roughness: .27, clearcoat: .8, clearcoatRoughness: .22, side: THREE.DoubleSide });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x101e25, metalness: .35, roughness: .12, clearcoat: 1, side: THREE.DoubleSide });
  const black = new THREE.MeshStandardMaterial({ color: 0x111719, roughness: .48, metalness: .3 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x121315, roughness: .9 });
  const alloy = new THREE.MeshStandardMaterial({ color: 0x8d9290, metalness: .9, roughness: .24 });
  const upholstery = new THREE.MeshStandardMaterial({ color: 0xb8b4a5, roughness: .91 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe3f7ff, emissive: 0xb9e8ff, emissiveIntensity: 3 });
  const red = new THREE.MeshStandardMaterial({ color: 0xe14235, emissive: 0xff2417, emissiveIntensity: 2 });
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = group) => {
    const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  };
  // Cross sections provide the long clean shoulder and clipped nose without a box body.
  function loft(sections: number[][], mat: THREE.Material, parent: THREE.Object3D = group) {
    const verts: number[] = [], indices: number[] = [];
    sections.forEach(([z, width, bottom, shoulder, crown]) => {
      [[-width*.84,bottom],[-width,shoulder],[-width*.77,crown],[width*.77,crown],[width,shoulder],[width*.84,bottom]].forEach(([x,y]) => verts.push(x,y,z));
    });
    for(let s=0;s<sections.length-1;s++) for(let j=0;j<6;j++) { const a=s*6+j,b=s*6+(j+1)%6,c=b+6,d=a+6; indices.push(a,b,d,b,c,d); }
    indices.push(0,2,1,0,3,2,0,4,3,0,5,4);
    const n=(sections.length-1)*6; indices.push(n,n+1,n+2,n,n+2,n+3,n,n+3,n+4,n,n+4,n+5);
    for(let i=0;i<indices.length;i+=3) [indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setIndex(indices);g.computeVertexNormals();return mesh(g,mat,parent);
  }
  loft([[-2.24,.69,.38,.55,.62],[-1.96,.86,.32,.66,.73],[-1.24,.92,.3,.79,.84],[-.65,.925,.3,.83,.87],[.6,.93,.3,.83,.89],[1.46,.9,.32,.81,.86],[2.17,.76,.42,.69,.76]],gold);
  loft([[-2.1,.76,.28,.33,.38],[-1.2,.88,.22,.29,.32],[1.6,.86,.22,.3,.33],[2.13,.73,.34,.39,.42]],black);
  // Panoramic canopy is deliberately hollow: windows and roof do not obstruct the cabin view.
  function panel(points: number[], mat: THREE.Material, parent: THREE.Object3D=group) {
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals(); return mesh(g,mat,parent);
  }
  // Interior-facing window surfaces use transparency so the passenger sees the real city.
  const windows = glass.clone(); windows.transparent=true; windows.opacity=.27; windows.depthWrite=false;
  panel([-.72,.84,-1.18,.72,.84,-1.18,.64,1.46,-.25,-.64,1.46,-.25],windows);
  panel([-.64,1.46,-.25,.64,1.46,-.25,.63,1.45,.65,-.63,1.45,.65],glass);
  panel([-.63,1.45,.65,.63,1.45,.65,.78,.87,1.75,-.78,.87,1.75],glass);
  function bar(a: THREE.Vector3,b: THREE.Vector3,r:number,mat:THREE.Material,parent:THREE.Object3D=group) {
    const v=b.clone().sub(a);const o=mesh(new THREE.CylinderGeometry(r,r,v.length(),8),mat,parent);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return o;
  }
  for(const s of [-1,1]) {
    bar(new THREE.Vector3(s*.76,.85,-1.16),new THREE.Vector3(s*.66,1.46,-.25),.034,gold);
    bar(new THREE.Vector3(s*.66,1.46,-.25),new THREE.Vector3(s*.65,1.45,.66),.035,gold);
    bar(new THREE.Vector3(s*.65,1.45,.66),new THREE.Vector3(s*.81,.88,1.7),.036,gold);
  }
  // Light bars and recessed lamp optics.
  const frontLamp=mesh(new THREE.BoxGeometry(1.46,.026,.032),white);frontLamp.position.set(0,.645,-2.16);
  const rearLamp=mesh(new THREE.BoxGeometry(1.45,.023,.035),red);rearLamp.position.set(0,.73,2.175);
  for(const x of [-.59,.59]){const l=mesh(new THREE.BoxGeometry(.14,.045,.026),white);l.position.set(x,.46,-2.185);}
  const wheels:THREE.Group[]=[];
  for(const x of [-.88,.88]) for(const z of [-1.35,1.37]) {
    const w=new THREE.Group();w.position.set(x,.355,z);group.add(w);wheels.push(w);
    const t=mesh(new THREE.TorusGeometry(.263,.088,16,40),rubber,w);t.rotation.y=Math.PI/2;
    const rim=mesh(new THREE.CylinderGeometry(.247,.247,.177,32),black,w);rim.rotation.z=Math.PI/2;
    const side=Math.sign(x);
    const cap=mesh(new THREE.CylinderGeometry(.112,.112,.19,24),alloy,w);cap.rotation.z=Math.PI/2;
    for(let i=0;i<7;i++) {
      const angle=i*Math.PI*2/7;
      const spoke=mesh(new THREE.BoxGeometry(.022,.2,.062),alloy,w);
      spoke.position.set(side*.098,Math.cos(angle)*.14,Math.sin(angle)*.14);spoke.rotation.x=angle;
    }
    const ring=mesh(new THREE.TorusGeometry(.239,.013,8,40),alloy,w);ring.rotation.y=Math.PI/2;ring.position.x=side*.105;
    // Subtle round arches conceal the tire/body intersection.
    const arch=mesh(new THREE.TorusGeometry(.365,.025,8,32,Math.PI),black);arch.rotation.y=Math.PI/2;arch.rotation.z=0;arch.position.set(x,.355,z);
  }
  const doors: {pivot:THREE.Group,side:number}[]=[];
  for(const side of [-1,1]) {
    const pivot=new THREE.Group();pivot.position.set(side*.8,.84,-.8);group.add(pivot);
    panel([side*.08,-.35,0,side*.11,-.34,1.69,side*.1,.01,1.68,side*.08,.0,0],gold,pivot);
    panel([side*.08,.01,0,side*.1,.01,1.68,side*-.15,.58,1.39,side*-.16,.6,.56],windows,pivot);
    const arm=mesh(new THREE.BoxGeometry(.075,.07,.62),black,pivot);arm.position.set(side*-.06,-.04,.85);
    bar(new THREE.Vector3(side*.08,0,0),new THREE.Vector3(side*.1,0,1.68),.012,black,pivot);
    doors.push({pivot,side});
  }
  // Two relaxed passenger seats, no steering wheel or pedals.
  const floor=mesh(new THREE.BoxGeometry(1.55,.07,2.18),black);floor.position.set(0,.49,.1);
  function cushion(w:number,h:number,d:number,parent:THREE.Object3D){
    const shape=new THREE.Shape(); const r=.06,x=-w/2,y=-h/2;
    shape.moveTo(x+r,y);shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);shape.lineTo(x+w,y+h-r);shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h);shape.lineTo(x+r,y+h);shape.quadraticCurveTo(x,y+h,x,y+h-r);shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);
    const geom=new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.025,bevelThickness:.025,curveSegments:8});geom.translate(0,0,-d/2);return mesh(geom,upholstery,parent);
  }
  for(const x of [-.4,.4]) {
    const seat=new THREE.Group();seat.position.set(x,.62,.64);group.add(seat);
    const base=cushion(.57,.14,.58,seat);base.position.z=-.1;
    const back=cushion(.56,.55,.12,seat);back.position.set(0,.31,.2);back.rotation.x=-.13;
    const head=cushion(.32,.2,.115,seat);head.position.set(0,.65,.23);
    for(const side of [-1,1]){const bolster=cushion(.07,.44,.11,seat);bolster.position.set(side*.235,.28,.13);}
    const belt=mesh(new THREE.BoxGeometry(.034,.58,.012),black,seat);belt.position.set(-.16,.3,.118);belt.rotation.z=-.3;
  }
  const dash=mesh(new THREE.BoxGeometry(1.43,.075,.27),black);dash.position.set(0,.86,-.81);dash.rotation.x=-.06;
  const screenFrame=mesh(new THREE.BoxGeometry(.57,.34,.025),black);screenFrame.position.set(0,1.015,-.705);screenFrame.rotation.x=-.1;
  const screen=mesh(new THREE.PlaneGeometry(.53,.3),new THREE.MeshBasicMaterial({color:0x111c22}));screen.position.set(0,1.015,-.689);screen.rotation.x=-.1;
  const ambient=new THREE.MeshStandardMaterial({color:0xd6bd87,emissive:0xd6bd87,emissiveIntensity:1.1});
  const strip=mesh(new THREE.BoxGeometry(1.35,.006,.008),ambient);strip.position.set(0,.895,-.66);
  return {group,setDoor(openAmount:number){const a=THREE.MathUtils.clamp(openAmount,0,1);for(const {pivot,side} of doors){pivot.rotation.z=-side*a*1.18;pivot.rotation.x=-a*.22;}},update(dt:number,speed:number){for(const w of wheels)w.rotation.x-=speed*dt/.35;}};
}
