import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Feature = { id?:number; name?:string; kind?:string; height?:number; levels?:number; lanes?:number; coordinates:number[][] };
type MapData = { roads:Feature[]; buildings:Feature[]; water:Feature[] };
const point = (p:number[]) => new THREE.Vector2((p[0]+97.745)*96100,-(p[1]-30.264)*111320);
const seeded = (n:number) => { let x=Math.sin(n*127.1+311.7)*43758.5453123; return x-Math.floor(x); };

export function createWorld(scene:THREE.Scene): {update(dt:number):void} {
  const root=new THREE.Group(); root.name='Austin · geographic city'; scene.add(root);
  const city=new THREE.Group(); root.add(city);
  function surfaceTexture(kind:'asphalt'|'stone') {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const ctx=canvas.getContext('2d')!;const pixels=ctx.createImageData(256,256);
    for(let i=0;i<256*256;i++) {
      const grain=seeded(i+ (kind==='asphalt'?10:90));const value=kind==='asphalt'?88+grain*42:190+grain*30;
      pixels.data.set([value,value,kind==='asphalt'?value+2:value-7,255],i*4);
    }
    ctx.putImageData(pixels,0,0);
    if(kind==='asphalt') {ctx.strokeStyle='rgba(30,33,35,.27)';ctx.lineWidth=.6;for(let i=0;i<9;i++){ctx.beginPath();ctx.moveTo(seeded(i)*256,seeded(i+50)*256);ctx.lineTo(seeded(i+5)*256,seeded(i+63)*256);ctx.stroke();}}
    else {ctx.strokeStyle='rgba(105,101,94,.25)';ctx.lineWidth=1;ctx.strokeRect(.5,.5,255,255);ctx.strokeRect(.5,128,255,128);}
    const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture;
  }
  const asphaltTexture=surfaceTexture('asphalt'),stoneTexture=surfaceTexture('stone');
  // Sampling in world metres keeps grain consistent across all merged road segments.
  function texturedMaterial(color:number,texture:THREE.Texture,scale:number,roughness:number,physical=false) {
    const material=physical
      ? new THREE.MeshPhysicalMaterial({color,map:texture,roughness,metalness:.16,envMapIntensity:1.05,clearcoat:.18,clearcoatRoughness:.45})
      : new THREE.MeshStandardMaterial({color,map:texture,roughness});
    material.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 vSurfacePosition;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        vec4 surfacePosition=vec4(transformed,1.0);
        #ifdef USE_INSTANCING
          surfacePosition=instanceMatrix*surfacePosition;
        #endif
        vSurfacePosition=(modelMatrix*surfacePosition).xyz;`);
      shader.fragmentShader='varying vec3 vSurfacePosition;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
        vec3 n=abs(normalize(cross(dFdx(vSurfacePosition),dFdy(vSurfacePosition))));
        vec2 surfaceUV=n.y>n.x&&n.y>n.z?vSurfacePosition.xz:(n.x>n.z?vSurfacePosition.zy:vSurfacePosition.xy);
        diffuseColor*=texture2D(map,surfaceUV*${scale.toFixed(4)});
        #endif`);
    };
    material.customProgramCacheKey=()=>`world-surface-${scale}-${physical?1:0}`;return material;
  }
  const asphalt=texturedMaterial(0x4f5356,asphaltTexture,.18,.4,true);
  const pavement=texturedMaterial(0xc4bcae,stoneTexture,.32,.91);
  const curb=new THREE.MeshStandardMaterial({color:0xbab5a8,roughness:.88});
  const metal=new THREE.MeshStandardMaterial({color:0x343b3b,metalness:.72,roughness:.32,envMapIntensity:.9});
  const stripe=new THREE.MeshStandardMaterial({color:0xe8e4c8,roughness:0.55,envMapIntensity:.4});
  const gold=new THREE.MeshStandardMaterial({color:0xd3ad61,roughness:0.55,metalness:.25});
  const lawn=new THREE.MeshStandardMaterial({color:0x4e6840,roughness:.92});
  const trunk=new THREE.MeshStandardMaterial({color:0x685849,roughness:1});
  const foliage=new THREE.MeshStandardMaterial({color:0x3a5a3c,roughness:.78});
  const leavesB=new THREE.MeshStandardMaterial({color:0x2f4a32,roughness:.82});
  const waterMaterial=new THREE.MeshPhysicalMaterial({color:0x3e7f86,metalness:0.72,roughness:0.08,transparent:true,opacity:0.88,envMapIntensity:1.6,clearcoat:1,clearcoatRoughness:.12});
  const carPaint=[0xe8e4dc,0x3d464b,0x657579,0x6b3430].map(color=>new THREE.MeshPhysicalMaterial({color,metalness:.72,roughness:.22,clearcoat:.6,clearcoatRoughness:.2,envMapIntensity:1.1}));
  const tireMaterial=new THREE.MeshStandardMaterial({color:0x181a1b,roughness:.87});
  const carLamp=new THREE.MeshStandardMaterial({color:0xe7dfc5,emissive:0xddd1a8,emissiveIntensity:.35,roughness:.22});
  const windowMaterial=new THREE.MeshPhysicalMaterial({color:0x3b555b,metalness:.55,roughness:.08,envMapIntensity:1.25});
  const glassMaterials=[0x263c43,0x44616b,0x76918d,0x334954].map(color=>new THREE.MeshPhysicalMaterial({color,metalness:.62,roughness:.08,envMapIntensity:1.2}));
  const frame=new THREE.MeshStandardMaterial({color:0x555d5c,metalness:.7,roughness:.32});
  const litWindow=new THREE.MeshStandardMaterial({color:0xe9ce99,emissive:0xd6a55c,emissiveIntensity:0.55,roughness:0.35});
  const buildingMaterials=[0xd5cbb9,0xb4b8b4,0xb9beb8,0xc4b29c,0x6f8286,0x8f9c9d].map(color=>texturedMaterial(color,stoneTexture,.17,.78));
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(12000,12000),new THREE.MeshStandardMaterial({color:0x7d8270,roughness:1})); ground.rotation.x=-Math.PI/2; ground.position.y=-0.02; ground.receiveShadow=true; root.add(ground);
  const boxGeometry=new THREE.BoxGeometry(1,1,1);
  function box(parent:THREE.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,material:THREE.Material,rotation=0) {
    const m=new THREE.Mesh(boxGeometry,material); m.position.set(x,y,z);m.scale.set(w,h,d);m.rotation.y=rotation;m.castShadow=true;m.receiveShadow=true; parent.add(m);return m;
  }
  function strip(parent:THREE.Object3D,a:THREE.Vector2,b:THREE.Vector2,width:number,y:number,mat:THREE.Material,height=0.12) {
    const dx=b.x-a.x,dz=b.y-a.y;return box(parent,(a.x+b.x)/2,y,(a.y+b.y)/2,width,height,Math.hypot(dx,dz),mat,Math.atan2(dx,dz));
  }
  function polygon(parent:THREE.Object3D,coords:number[][],height:number,material:THREE.Material,base=0) {
    if(coords.length<3)return;
    const pts=coords.map(point);const shape=new THREE.Shape(pts.map(p=>new THREE.Vector2(p.x,-p.y)));
    const geo=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false});geo.rotateX(-Math.PI/2);
    const m=new THREE.Mesh(geo,material);m.position.y=base;m.castShadow=height>1;m.receiveShadow=true;parent.add(m);return {m,pts};
  }
  const treeGeometry=new THREE.IcosahedronGeometry(1,2);
  function tree(parent:THREE.Object3D,x:number,z:number,seed:number) {
    const h=6+seeded(seed)*6;
    box(parent,x,h*.38,z,.28,h*.76,.28,trunk);
    const crown=new THREE.Mesh(treeGeometry,foliage);crown.position.set(x,h,z);crown.scale.set(h*.52,h*.58,h*.52);crown.rotation.y=seed; crown.castShadow=true;parent.add(crown);
    const canopy=new THREE.Mesh(treeGeometry,leavesB);canopy.position.set(x+h*.12,h*.78,z-h*.08);canopy.scale.set(h*.38,h*.32,h*.4);canopy.castShadow=true;parent.add(canopy);
  }
  let junctions:THREE.Vector2[]=[];
  function nearJunction(p:THREE.Vector2,radius=15) {return junctions.some(j=>j.distanceToSquared(p)<radius*radius);}
  function road(parent:THREE.Object3D,f:Feature) {
    const pts=f.coordinates.map(point);const major=/primary|secondary|trunk/.test(f.kind||'')||/Congress|Cesar Chavez|Riverside/.test(f.name||'');
    const walking=/footway|path|cycleway|pedestrian/.test(f.kind||'');
    const service=/service/.test(f.kind||'');
    const width=walking?2.5:service?4.2:major?Math.max(14,Math.min(23,(f.lanes||4)*3.3)):9;
    let travelled=0;
    for(let i=1;i<pts.length;i++) {
      const a=pts[i-1],b=pts[i],len=a.distanceTo(b);if(len<0.2)continue;
      strip(parent,a,b,width+5,0.00,pavement);strip(parent,a,b,width,.10,walking?pavement:asphalt);
      if(walking||service)continue;
      const direction=b.clone().sub(a).normalize(),normal=new THREE.Vector2(-direction.y,direction.x);
      for(let d=0.4;d<len;d+=Math.min(12,len)) {
        const center=a.clone().addScaledVector(direction,d);
        if(nearJunction(center,major?17:14))continue;
        const end=a.clone().addScaledVector(direction,Math.min(d+11.6,len));
        for(const side of [-1,1])strip(parent,center.clone().addScaledVector(normal,side*(width/2+.16)),end.clone().addScaledVector(normal,side*(width/2+.16)),.28,.18,curb,.16);
        if(major)for(const side of [-1,1])strip(parent,center.clone().addScaledVector(normal,side*.17),end.clone().addScaledVector(normal,side*.17),.10,.165,gold,.012);
        if(Math.floor((travelled+d)/12)%2===0)for(const offset of major?[-width*.25,width*.25]:[0])strip(parent,center.clone().addScaledVector(normal,offset),end.clone().addScaledVector(normal,offset),.12,.165,stripe,.012);
      }
      if(major)for(let d=12;d<len-8;d+=42) {
        const v=a.clone().addScaledVector(direction,d).addScaledVector(normal,width*.5+1.8);
        if(nearJunction(v,22))continue;
        // Street tree wells, slim light poles and benches make the curb read at human scale.
        box(parent,v.x,.09,v.y,2.1,.16,2.1,lawn);tree(parent,v.x,v.y,d+i*12);
        const p=a.clone().addScaledVector(direction,d+12).addScaledVector(normal,width*.5+1.1);
        box(parent,p.x,4.3,p.y,.13,8.6,.13,metal);
        box(parent,p.x-normal.x*.75,8.6,p.y-normal.y*.75,1.6,.12,.32,metal,Math.atan2(-normal.y,normal.x));
        const seat=v.clone().addScaledVector(direction,4);
        box(parent,seat.x,.55,seat.y,1.8,.12,.6,trunk,Math.atan2(-direction.y,direction.x));
        box(parent,seat.x,.92,seat.y+.26,1.8,.55,.10,trunk,Math.atan2(-direction.y,direction.x));
      }
      travelled+=len;
    }
  }
  function building(parent:THREE.Object3D,f:Feature,index:number) {
    const h=Math.min(250,Math.max(4,Number(f.height)||Number(f.levels)*3.5||8+seeded(index)*12));
    const material=buildingMaterials[index%buildingMaterials.length];const result=polygon(parent,f.coordinates,h,material,0);if(!result)return;
    const pts=result.pts;
    const signedArea=pts.reduce((area,p,i)=>{const q=pts[(i+1)%pts.length];return area+p.x*q.y-q.x*p.y;},0);
    const winding=signedArea>=0?1:-1;
    // Curtain wall towers, stone offices and older storefronts have distinct bay proportions.
    const curtain=h>60&&index%3!==0;
    const bay=curtain?3.1:4.0,floor=curtain?3.45:3.8;
    const windowGroups=new Map<THREE.Material,THREE.Matrix4[]>();const obj=new THREE.Object3D();
    for(let e=1;e<pts.length;e++) {
      const a=pts[e-1],b=pts[e],len=a.distanceTo(b);if(len<3||len>350)continue;
      const dx=(b.x-a.x)/len,dz=(b.y-a.y)/len,nx=dz*winding,nz=-dx*winding,rotation=Math.atan2(-dz,dx);
      const count=Math.max(1,Math.floor((len-.8)/bay)),spacing=(len-.8)/count;
      for(let y=4.7;y<h-1;y+=floor)for(let cell=0;cell<count;cell++) {
        const t=.4+spacing*(cell+.5),isLit=seeded(index*171+cell*7+Math.floor(y)*29)>.975;
        const glass=isLit?litWindow:glassMaterials[(index+Math.floor(seeded(index+cell*13+Math.floor(y))*3))%glassMaterials.length];
        obj.position.set(a.x+dx*t+nx*.08,y,a.y+dz*t+nz*.08);
        obj.rotation.set(0,rotation,0);obj.scale.set(spacing*(curtain?.93:.68),curtain?2.92:2.3,.13);obj.updateMatrix();
        const group=windowGroups.get(glass)||[];group.push(obj.matrix.clone());windowGroups.set(glass,group);
      }
      if(curtain) {
        for(let t=.4;t<len;t+=spacing)box(parent,a.x+dx*t+nx*.12,h*.5,a.y+dz*t+nz*.12,.11,h-.8,.17,frame,rotation);
        for(let y=3.1;y<h;y+=floor)box(parent,(a.x+b.x)/2+nx*.12,y,(a.y+b.y)/2+nz*.12,len,.20,.18,frame,rotation);
      }
      // Recessed retail glazing and a stone cornice give every street frontage a base.
      for(let t=2;t<len-1.2;t+=4.3)box(parent,a.x+dx*t+nx*.1,1.65,a.y+dz*t+nz*.1,3.2,2.6,.18,windowMaterial,rotation);
      box(parent,(a.x+b.x)/2+nx*.17,3.25,(a.y+b.y)/2+nz*.17,len,.28,.4,curb,rotation);
      if(h<23&&len>12) {
        const t=len*.5;box(parent,a.x+dx*t+nx*.7,3,a.y+dz*t+nz*.7,Math.min(len*.65,16),.16,1.6,metal,rotation);
      }
    }
    for(const [glass,transforms] of windowGroups) {
      const windows=new THREE.InstancedMesh(boxGeometry,glass,transforms.length);transforms.forEach((t,i)=>windows.setMatrixAt(i,t));parent.add(windows);
    }
    if(h>35) {
      for(let e=1;e<pts.length;e++) {
        const a=pts[e-1],b=pts[e],length=a.distanceTo(b);if(length<1)continue;
        box(parent,(a.x+b.x)/2,h+.26,(a.y+b.y)/2,length,.52,.3,material,Math.atan2(-(b.y-a.y),b.x-a.x));
      }
      const c=pts.reduce((v,p)=>v.add(p),new THREE.Vector2()).multiplyScalar(1/pts.length);
      box(parent,c.x,h+1.8,c.y,8,3.6,7,material);
    }
  }
  function signTexture(text:string,color:string) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d')!;
    ctx.fillStyle=color;ctx.fillRect(0,0,512,128);ctx.strokeStyle='#e9eadf';ctx.lineWidth=5;ctx.strokeRect(7,7,498,114);
    ctx.fillStyle='#f3f2e8';ctx.font='600 45px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,66);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({map:texture,roughness:.7,side:THREE.DoubleSide});
  }
  const congressSign=signTexture('CONGRESS AVE','#234e45'),secondSign=signTexture('W 2ND ST','#234e45');
  function streetIntersection(parent:THREE.Object3D,c:THREE.Vector2) {
    const along=new THREE.Vector2(.31,-.951),across=new THREE.Vector2(.951,.31);
    for(const side of [-1,1]) {
      // Ladder crossings set back from the intersection center on all four approaches.
      for(let t=-8;t<=8;t+=1.65) {
        const p=c.clone().addScaledVector(along,side*10).addScaledVector(across,t);
        box(parent,p.x,.21,p.y,.64,.055,3.3,stripe,Math.atan2(along.x,along.y));
      }
      for(let t=-3.5;t<=3.5;t+=1.5) {
        const p=c.clone().addScaledVector(across,side*15).addScaledVector(along,t);
        box(parent,p.x,.21,p.y,.65,.055,3,stripe,Math.atan2(across.x,across.y));
      }
      const corner=c.clone().addScaledVector(across,side*14).addScaledVector(along,side*8.2);
      box(parent,corner.x,2.8,corner.y,.11,5.6,.11,metal);
      const sign=new THREE.Mesh(new THREE.PlaneGeometry(2.8,.7),congressSign);sign.position.set(corner.x,5.45,corner.y);sign.rotation.y=Math.atan2(-along.y,along.x);parent.add(sign);
      const second=new THREE.Mesh(new THREE.PlaneGeometry(2.2,.6),secondSign);second.position.set(corner.x,4.72,corner.y);second.rotation.y=Math.atan2(-across.y,across.x);parent.add(second);
      const signal=corner.clone().addScaledVector(across,-side*2.7);
      box(parent,(corner.x+signal.x)/2,5.9,(corner.y+signal.y)/2,2.8,.13,.13,metal,Math.atan2(-across.y,across.x));
      box(parent,signal.x,5.25,signal.y,.4,1.1,.35,metal);
      const light=new THREE.Mesh(new THREE.CircleGeometry(.11,12),new THREE.MeshStandardMaterial({color:0xdca65a,emissive:0xcb8729,emissiveIntensity:.65}));light.position.set(signal.x,5.25,signal.y+.19);parent.add(light);
      box(parent,corner.x+along.x*3,.28,corner.y+along.y*3,1,.55,1,curb);
    }
  }
  function parkedTraffic(parent:THREE.Object3D,roads:Feature[]) {
    const wheelGeometry=new THREE.CylinderGeometry(.32,.32,.18,12);wheelGeometry.rotateZ(Math.PI/2);
    const positions:THREE.Vector2[]=[];
    for(const r of roads) {
      if(!/Congress Avenue|[EW].*2nd Street/.test(r.name||''))continue;
      const pts=r.coordinates.map(point);const major=/Congress/.test(r.name||'');const width=major?Math.max(14,Math.min(23,(r.lanes||4)*3.3)):9;
      for(let i=1;i<pts.length;i++) {
        const a=pts[i-1],b=pts[i],length=a.distanceTo(b);if(length<30)continue;
        const direction=b.clone().sub(a).normalize(),normal=new THREE.Vector2(direction.y,-direction.x),angle=Math.atan2(direction.x,direction.y);
        for(let t=20;t<length-10;t+=58) {
          const c=a.clone().addScaledVector(direction,t).addScaledVector(normal,width/2-1.2);
          if(c.length()>620||nearJunction(c,23)||positions.some(p=>p.distanceTo(c)<18)||positions.length>=12)continue;
          const index=positions.length;positions.push(c);
          const part=(side:number,along:number,y:number,w:number,h:number,d:number,mat:THREE.Material)=>box(parent,c.x+normal.x*side+direction.x*along,y,c.y+normal.y*side+direction.y*along,w,h,d,mat,angle);
          part(0,0,.64,1.82,.6,4.4,carPaint[index%4]);part(0,-.1,1.1,1.56,.68,2.35,windowMaterial);
          part(0,-.1,1.47,1.6,.12,1.45,carPaint[index%4]);part(0,1.65,.93,1.8,.18,1.05,carPaint[index%4]);
          part(0,-1.68,.92,1.8,.19,1.04,carPaint[index%4]);
          for(const side of [-1,1]) {
            part(side*.61,2.22,.67,.42,.18,.06,carLamp);
            for(const along of [-1.4,1.4]) {
              const wheel=new THREE.Mesh(wheelGeometry,tireMaterial);wheel.position.set(c.x+normal.x*side*.92+direction.x*along,.37,c.y+normal.y*side*.92+direction.y*along);wheel.rotation.y=angle;parent.add(wheel);
            }
          }
        }
      }
    }
  }
  function createFallback() {
    const coords=(x:number,z:number)=>[-97.745+x/96100,30.264-z/111320];
    const roads:Feature[]=[];
    roads.push({name:'Congress Avenue',kind:'primary',coordinates:[coords(-370,1300),coords(360,-1200)]});
    for(let z=-1100;z<1300;z+=125)roads.push({kind:'secondary',coordinates:[coords(-1100,z-280),coords(1100,z+360)]});
    for(const x of [-530,-260,270,540])roads.push({kind:'residential',coordinates:[coords(x-370,1300),coords(x+360,-1200)]});
    const buildings:Feature[]=[];
    for(let row=0;row<17;row++)for(let col=0;col<8;col++) {
      const z=-1100+row*125;if(z>120&&z<410)continue;
      const x=-850+col*240-z*.29;
      const height=z<90?15+seeded(row*31+col)*95:5+seeded(col+row*7)*13;
      buildings.push({height,coordinates:[coords(x,z),coords(x+76,z+22),coords(x+61,z+82),coords(x-15,z+60),coords(x,z)]});
    }
    render({roads,buildings,water:[{name:'Lady Bird Lake',coordinates:[coords(-2000,-260),coords(-1100,-80),coords(0,175),coords(2000,390),coords(2000,610),coords(0,390),coords(-1100,100),coords(-2000,-60)]}]});
  }
  function render(data:MapData) {
    city.clear();
    const nodes=new Map<string,{point:THREE.Vector2,names:Set<string>}>();
    for(const r of data.roads||[]) {
      if(/footway|path|cycleway|pedestrian|service/.test(r.kind||''))continue;
      for(const coord of r.coordinates) {
        const p=point(coord),key=`${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        const node=nodes.get(key)||{point:p,names:new Set<string>()};node.names.add(r.name||String(r.id));nodes.set(key,node);
      }
    }
    junctions=[...nodes.values()].filter(n=>n.names.size>1).map(n=>n.point);
    for(const w of data.water||[])polygon(city,w.coordinates,.08,waterMaterial,-.17);
    (data.buildings||[]).forEach((b,i)=>building(city,b,i));
    (data.roads||[]).forEach(r=>road(city,r));
    streetIntersection(city,point([-97.7442121,30.2643199]));
    parkedTraffic(city,data.roads||[]);
    // Congress bridge balustrades and regular concrete piers, aligned to the street.
    for(const side of [-1,1])for(let z=150;z<435;z+=4) {
      const x=60-z*.3+side*12;box(city,x,.7,z,.28,1.2,.28,pavement);
      box(city,x,1.2,z,.24,.18,4.5,pavement,-.291);
    }
    for(let z=165;z<435;z+=45)for(const side of [-1,1])box(city,60-z*.3+side*8,-1.7,z,2,4,4,pavement);
    // Waterfront canopy and planted promenades follow the riverbanks.
    for(let i=0;i<115;i++) {
      const x=-1400+i*25,z=180+x*.15;
      if(Math.abs(x-(20-z*.3))<35)continue;
      tree(city,x,z-40-seeded(i)*20,i*3);tree(city,x,z+210+seeded(i*8)*20,i*7);
    }
    for(let i=0;i<22;i++) {
      const x=-700+i*62,z=365+x*.15;
      box(city,x,.02,z,24,.08,6,lawn);
    }
    // Batch street furniture and markings: thousands of details, a handful of draws.
    const batches=new Map<THREE.Material,THREE.Mesh[]>();
    for(const child of [...city.children]) {
      if(child instanceof THREE.Mesh && !(child instanceof THREE.InstancedMesh) && child.geometry===boxGeometry) {
        const material=child.material as THREE.Material;
        const list=batches.get(material)||[];list.push(child);batches.set(material,list);
      }
    }
    for(const [material,meshes] of batches) {
      const batch=new THREE.InstancedMesh(boxGeometry,material,meshes.length);
      meshes.forEach((mesh,i)=>{mesh.updateMatrix();batch.setMatrixAt(i,mesh.matrix);city.remove(mesh);});
      batch.castShadow=true;batch.receiveShadow=true;city.add(batch);
    }
    const instanceGroups=new Map<THREE.Material,THREE.InstancedMesh[]>();
    for(const child of [...city.children]) if(child instanceof THREE.InstancedMesh) {
      const material=child.material as THREE.Material;
      const group=instanceGroups.get(material)||[];group.push(child);instanceGroups.set(material,group);
    }
    for(const [material,meshes] of instanceGroups) {
      if(meshes.length<2)continue;
      const batch=new THREE.InstancedMesh(boxGeometry,material,meshes.reduce((n,m)=>n+m.count,0));
      const matrix=new THREE.Matrix4();let index=0;
      for(const mesh of meshes){for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);batch.setMatrixAt(index++,matrix);}city.remove(mesh);mesh.dispose();}
      batch.castShadow=true;batch.receiveShadow=true;city.add(batch);
    }
    const solids=new Map<THREE.Material,THREE.Mesh[]>();
    for(const child of [...city.children]) {
      if(child instanceof THREE.Mesh && !(child instanceof THREE.InstancedMesh) && child.material!==waterMaterial && child.material!==congressSign && child.material!==secondSign) {
        const material=child.material as THREE.Material;
        const list=solids.get(material)||[];list.push(child);solids.set(material,list);
      }
    }
    for(const [material,meshes] of solids) {
      const geometries=meshes.map(mesh=>{mesh.updateMatrix();return mesh.geometry.clone().applyMatrix4(mesh.matrix);});
      const merged=mergeGeometries(geometries);
      geometries.forEach(geometry=>geometry.dispose());
      if(merged){meshes.forEach(mesh=>city.remove(mesh));const mesh=new THREE.Mesh(merged,material);mesh.castShadow=true;mesh.receiveShadow=true;city.add(mesh);}
    }
  }
  createFallback();
  fetch(`${import.meta.env.BASE_URL}data/austin.json`).then(r=>{if(!r.ok)throw new Error('Map unavailable');return r.json();}).then((data:MapData)=>{if(data.roads?.length&&data.buildings?.length)render(data);}).catch(()=>{ /* Bundled geographic approximation remains available offline. */ });
  let time=0;
  return {update(dt:number){time+=dt;waterMaterial.roughness=.19+Math.sin(time*.3)*.025;}};
}
