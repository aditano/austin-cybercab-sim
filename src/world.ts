import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAPITOL, ROAD_Y } from './geo';
import type { HeroKind, StreetAssets, PropKind } from './assets';
import { kindFromIndex } from './assets';
import { streetBudget, type Quality } from './logic';

type Feature = { id?:number; name?:string; kind?:string; height?:number; levels?:number; lanes?:number; coordinates:number[][] };
type MapData = { roads:Feature[]; buildings:Feature[]; water:Feature[] };
const point = (p:number[]) => new THREE.Vector2((p[0]+97.745)*96100,-(p[1]-30.264)*111320);
const seeded = (n:number) => { let x=Math.sin(n*127.1+311.7)*43758.5453123; return x-Math.floor(x); };

let mapDataPromise: Promise<MapData> | null = null;

export function loadMapData(): Promise<MapData> {
  if (!mapDataPromise) {
    mapDataPromise = fetch(`${import.meta.env.BASE_URL}data/austin.json`).then((response) => {
      if (!response.ok) throw new Error('Map unavailable');
      return response.json() as Promise<MapData>;
    });
  }
  return mapDataPromise;
}

type StreetSpot = { kind: PropKind | 'park'; x: number; z: number; yaw: number; seed: number };

export function createWorld(scene:THREE.Scene, onStatus?: (text: string) => void): {
  update(dt:number):void;
  ready: Promise<void>;
  city: THREE.Group;
  dress(assets: StreetAssets, quality: Quality): THREE.Object3D[];
} {
  const root=new THREE.Group(); root.name='Austin · geographic city'; scene.add(root);
  const city=new THREE.Group(); root.add(city);
  const loading = new THREE.LoadingManager();
  const textureReady = new Promise<void>((resolve) => { loading.onLoad = () => resolve(); });
  const texLoader = new THREE.TextureLoader(loading);
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  function mapTexture(file:string, srgb:boolean) {
    const texture=texLoader.load(`${import.meta.env.BASE_URL}textures/${file}`);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.anisotropy=coarse ? 2 : 8;
    texture.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;
    return texture;
  }
  const asphaltDiff=mapTexture('asphalt_diff.jpg',true),asphaltNor=mapTexture('asphalt_nor.jpg',false),asphaltRough=mapTexture('asphalt_rough.jpg',false);
  const wallDiff=mapTexture('wall_diff.jpg',true),wallNor=mapTexture('wall_nor.jpg',false),wallRough=mapTexture('wall_rough.jpg',false);
  const concreteDiff=mapTexture('concrete_diff.jpg',true),concreteNor=mapTexture('concrete_nor.jpg',false),concreteRough=mapTexture('concrete_rough.jpg',false);
  const barkDiff=mapTexture('bark_diff.jpg',true),barkNor=mapTexture('bark_nor.jpg',false);
  const leavesDiff=mapTexture('leaves_diff.jpg',true),leavesAlpha=mapTexture('leaves_alpha.png',false);
  // World-space triplanar sampling so instanced road boxes and extruded walls share one texel size.
  function texturedMaterial(color:number,diffuse:THREE.Texture,normal:THREE.Texture,rough:THREE.Texture,scale:number,roughness:number,physical=false) {
    const material=physical
      ? new THREE.MeshPhysicalMaterial({color,map:diffuse,normalMap:normal,roughnessMap:rough,roughness,metalness:.04,envMapIntensity:.42,clearcoat:.06,clearcoatRoughness:.4})
      : new THREE.MeshStandardMaterial({color,map:diffuse,normalMap:normal,roughnessMap:rough,roughness,metalness:.02,envMapIntensity:.35});
    const scaleLit=scale.toFixed(4);
    material.normalScale=new THREE.Vector2(physical?0.85:0.55,physical?0.85:0.55);
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
        vec3 triBlend=pow(abs(normalize(cross(dFdx(vSurfacePosition),dFdy(vSurfacePosition)))),vec3(4.0));
        triBlend/=triBlend.x+triBlend.y+triBlend.z;
        vec2 uvX=vSurfacePosition.zy*${scaleLit};
        vec2 uvY=vSurfacePosition.xz*${scaleLit};
        vec2 uvZ=vSurfacePosition.xy*${scaleLit};
        diffuseColor*=texture2D(map,uvX)*triBlend.x+texture2D(map,uvY)*triBlend.y+texture2D(map,uvZ)*triBlend.z;
        #endif`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`float roughnessFactor=roughness;
        #ifdef USE_ROUGHNESSMAP
          vec3 roughBlend=pow(abs(normalize(cross(dFdx(vSurfacePosition),dFdy(vSurfacePosition)))),vec3(4.0));
          roughBlend/=roughBlend.x+roughBlend.y+roughBlend.z;
          roughnessFactor*=texture2D(roughnessMap,vSurfacePosition.zy*${scaleLit}).g*roughBlend.x
            +texture2D(roughnessMap,vSurfacePosition.xz*${scaleLit}).g*roughBlend.y
            +texture2D(roughnessMap,vSurfacePosition.xy*${scaleLit}).g*roughBlend.z;
        #endif`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#ifdef USE_NORMALMAP
        vec3 normalBlend=pow(abs(normalize(cross(dFdx(vSurfacePosition),dFdy(vSurfacePosition)))),vec3(4.0));
        normalBlend/=normalBlend.x+normalBlend.y+normalBlend.z;
        vec3 tx=texture2D(normalMap,vSurfacePosition.zy*${scaleLit}).xyz*2.0-1.0;
        vec3 ty=texture2D(normalMap,vSurfacePosition.xz*${scaleLit}).xyz*2.0-1.0;
        vec3 tz=texture2D(normalMap,vSurfacePosition.xy*${scaleLit}).xyz*2.0-1.0;
        vec3 mapped=normalize(vec3(tx.z,tx.y,tx.x)*normalBlend.x+vec3(ty.x,ty.z,ty.y)*normalBlend.y+vec3(tz.x,tz.y,tz.z)*normalBlend.z);
        normal=normalize(mix(normal,mapped,.72));
        #endif`);
    };
    material.customProgramCacheKey=()=>`world-pbr-${scaleLit}-${physical?1:0}`;
    return material;
  }
  const asphalt=texturedMaterial(0xffffff,asphaltDiff,asphaltNor,asphaltRough,.42,1,true);
  const pavement=texturedMaterial(0xffffff,concreteDiff,concreteNor,concreteRough,.55,.96);
  const curb=texturedMaterial(0xd7d2c8,concreteDiff,concreteNor,concreteRough,.7,.9);
  const metal=new THREE.MeshStandardMaterial({color:0x3a4244,metalness:.82,roughness:.28,envMapIntensity:1.05});
  const stripe=new THREE.MeshStandardMaterial({color:0xf4f0dc,roughness:0.42,metalness:.02,envMapIntensity:.35});
  const gold=new THREE.MeshStandardMaterial({color:0xe0c27a,roughness:0.48,metalness:.18,envMapIntensity:.4});
  const lawn=new THREE.MeshStandardMaterial({color:0x4d643c,roughness:.94});
  const benchWood=new THREE.MeshStandardMaterial({map:barkDiff,color:0xc4b2a2,roughness:.88});
  const trunkMat=new THREE.MeshStandardMaterial({map:barkDiff,normalMap:barkNor,color:0xffffff,roughness:.86,normalScale:new THREE.Vector2(.8,.8)});
  const leafMat=new THREE.MeshStandardMaterial({
    map:leavesDiff,alphaMap:leavesAlpha,alphaTest:.38,side:THREE.DoubleSide,roughness:.8,color:0xffffff,envMapIntensity:.2,
  });
  leafMat.userData.castShadow=false;
  const waterMaterial=new THREE.MeshPhysicalMaterial({color:0x2a656c,metalness:0.55,roughness:0.08,transparent:true,opacity:0.92,envMapIntensity:1.7,clearcoat:1,clearcoatRoughness:.12});
  const windowMaterial=new THREE.MeshPhysicalMaterial({color:0x8eafb6,metalness:.08,roughness:.04,envMapIntensity:1.85,clearcoat:1,clearcoatRoughness:.05,transparent:true,opacity:.78});
  const glassMaterials=[0x9bb8c0,0xa9c6cc,0x8eafb8,0xb7d0d4].map(color=>new THREE.MeshPhysicalMaterial({color,metalness:.62,roughness:.08,envMapIntensity:2.6,clearcoat:1,clearcoatRoughness:.12,transparent:true,opacity:.55,ior:1.45}));
  const frame=new THREE.MeshStandardMaterial({color:0x6a726f,metalness:.72,roughness:.3,envMapIntensity:1});
  const litWindow=new THREE.MeshStandardMaterial({color:0xffe2b0,emissive:0xffc57a,emissiveIntensity:1.15,roughness:0.28});
  const buildingMaterials=[0xf3efe4,0xe6dfd2,0xf7f1e6,0xddd4c6,0xd5dbd6,0xefe6d6].map(color=>texturedMaterial(color,wallDiff,wallNor,wallRough,.55,.84));
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
  const leafCard=new THREE.PlaneGeometry(1,1);
  const leafUv=leafCard.attributes.uv as THREE.BufferAttribute;
  for(let i=0;i<leafUv.count;i++) leafUv.setXY(i,leafUv.getX(i)*0.5,0.12+leafUv.getY(i)*0.76);
  function tree(parent:THREE.Object3D,x:number,z:number,seed:number) {
    const h=7.6+seeded(seed)*2.8;
    const trunkGeo=new THREE.CylinderGeometry(.18,.34,h*.62,7,1);
    trunkGeo.translate(0,h*.31,0);
    const trunkUv=trunkGeo.attributes.uv as THREE.BufferAttribute;
    for(let i=0;i<trunkUv.count;i++) trunkUv.setXY(i,trunkUv.getX(i)*2,trunkUv.getY(i)*(h*.22));
    const trunkMesh=new THREE.Mesh(trunkGeo,trunkMat);
    trunkMesh.position.set(x,0,z);
    trunkMesh.castShadow=true;
    trunkMesh.receiveShadow=true;
    parent.add(trunkMesh);
    const crown=h*.72;
    for(let i=0;i<11;i++) {
      const leaf=new THREE.Mesh(leafCard,leafMat);
      const ang=seeded(seed+i*17)*Math.PI*2;
      const rad=(.25+seeded(seed+i*3)*.85)*(h*.38);
      leaf.position.set(x+Math.cos(ang)*rad*.45,crown+(seeded(seed+i*5)-.45)*1.4,z+Math.sin(ang)*rad*.4);
      leaf.scale.set(h*(.46+seeded(seed+i)*.2),h*(.26+seeded(seed+i*9)*.1),1);
      leaf.rotation.set((seeded(seed+i*11)-.5)*.7,ang,(seeded(seed+i*13)-.5)*.4);
      leaf.castShadow=false;
      parent.add(leaf);
    }
  }
  const streetSpots:StreetSpot[]=[];
  const dressed=new THREE.Group(); dressed.name='street-models';
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
      if(major)for(let d=12;d<len-8;d+=28) {
        const v=a.clone().addScaledVector(direction,d).addScaledVector(normal,width*.5+4.4);
        if(nearJunction(v,22))continue;
        const yaw=Math.atan2(-direction.y,direction.x);
        const seed=d+i*12;
        box(parent,v.x,.09,v.y,2.1,.16,2.1,lawn);
        streetSpots.push({kind:'tree',x:v.x,z:v.y,yaw,seed});
        const p=a.clone().addScaledVector(direction,d+12).addScaledVector(normal,width*.5+1.1);
        streetSpots.push({kind:'lamp',x:p.x,z:p.y,yaw:Math.atan2(-normal.y,normal.x),seed:seed+3});
        const seat=v.clone().addScaledVector(direction,4);
        streetSpots.push({kind:'bench',x:seat.x,z:seat.y,yaw,seed:seed+7});
        if(Math.floor(d/28)%3===0) streetSpots.push({kind:'planter',x:v.x+normal.x*1.6,z:v.y+normal.y*1.6,yaw,seed:seed+9});
        if(Math.floor(d/28)%4===1) streetSpots.push({kind:'hydrant',x:p.x+normal.x*0.6,z:p.y+normal.y*0.6,yaw,seed:seed+11});
        if(Math.floor(d/28)%5===2) streetSpots.push({kind:'trash',x:seat.x-direction.x*2.2,z:seat.y-direction.y*2.2,yaw,seed:seed+13});
        if(Math.floor(d/28)%7===0) streetSpots.push({kind:'stop',x:p.x+normal.x*0.2,z:p.y+normal.y*0.2,yaw,seed:seed+15});
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
    const tall=h>72;
    const bay=(curtain?6.8:8.4)*(tall?1.25:1),floor=(curtain?4.4:4.8)*(tall?1.35:1);
    const windowGroups=new Map<THREE.Material,THREE.Matrix4[]>();const obj=new THREE.Object3D();
    for(let e=1;e<pts.length;e++) {
      const a=pts[e-1],b=pts[e],len=a.distanceTo(b);if(len<3||len>350)continue;
      const dx=(b.x-a.x)/len,dz=(b.y-a.y)/len,nx=dz*winding,nz=-dx*winding,rotation=Math.atan2(-dz,dx);
      const count=Math.max(1,Math.floor((len-.8)/bay)),spacing=(len-.8)/count;
      for(let y=4.7;y<h-1;y+=floor)for(let cell=0;cell<count;cell++) {
        const t=.4+spacing*(cell+.5),isLit=seeded(index*171+cell*7+Math.floor(y)*29)>.975;
        const glass=isLit?litWindow:glassMaterials[(index+Math.floor(seeded(index+cell*13+Math.floor(y))*3))%glassMaterials.length];
        obj.position.set(a.x+dx*t+nx*.1,y,a.y+dz*t+nz*.1);
        obj.rotation.set(0,rotation,0);obj.scale.set(spacing*(curtain?.82:.7),curtain?3.35:2.85,.1);obj.updateMatrix();
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
  function parkedTraffic(roads:Feature[]) {
    const positions:THREE.Vector2[]=[];
    for(const r of roads) {
      if(!/Congress Avenue|[EW].*2nd Street/.test(r.name||''))continue;
      const pts=r.coordinates.map(point);const major=/Congress/.test(r.name||'');const width=major?Math.max(14,Math.min(23,(r.lanes||4)*3.3)):9;
      for(let i=1;i<pts.length;i++) {
        const a=pts[i-1],b=pts[i],length=a.distanceTo(b);if(length<30)continue;
        const direction=b.clone().sub(a).normalize(),normal=new THREE.Vector2(-direction.y,direction.x);
        for(let t=20;t<length-10;t+=48) {
          const c=a.clone().addScaledVector(direction,t).addScaledVector(normal,width/2+0.9);
          if(c.length()>620||nearJunction(c,26)||positions.some(p=>p.distanceTo(c)<16)||positions.length>=16)continue;
          positions.push(c);
          streetSpots.push({kind:'park',x:c.x,z:c.y,yaw:Math.atan2(-direction.x,-direction.y),seed:positions.length});
        }
      }
    }
  }
  function dressLandmarks(parent:THREE.Object3D,data:MapData) {
    const granite=new THREE.MeshStandardMaterial({color:0xd7b09a,roughness:.78});
    const domeMat=new THREE.MeshStandardMaterial({color:0xc45c52,roughness:.72,metalness:.06,emissive:0x4a2824,emissiveIntensity:.08});
    const statueMat=new THREE.MeshStandardMaterial({color:0xf6f1e8,roughness:.5});
    const lit=new THREE.MeshStandardMaterial({color:0xf0d2a0,emissive:0xffb45a,emissiveIntensity:.7});
    const crownGlass=new THREE.MeshPhysicalMaterial({color:0xb7d0d2,metalness:.55,roughness:.08,transparent:true,opacity:.84,envMapIntensity:1.3});
    const named=new Map<string,Feature>();
    for(const b of data.buildings||[]) if(b.name) named.set(b.name,b);
    const centroid=(coords:number[][])=>{let x=0,z=0;for(const c of coords){const p=point(c);x+=p.x;z+=p.y;}return {x:x/coords.length,z:z/coords.length};};
    const frost=named.get('Frost Bank Tower');
    if(frost) {
      const c=centroid(frost.coordinates),h=frost.height||157;
      const prism=new THREE.Mesh(new THREE.ConeGeometry(16,42,4),crownGlass);
      prism.position.set(c.x,h+18,c.z);prism.rotation.y=Math.PI/4;prism.castShadow=true;parent.add(prism);
      const spike=new THREE.Mesh(new THREE.BoxGeometry(8,46,8),crownGlass);
      spike.position.set(c.x+5,h+26,c.z);spike.rotation.z=-.38;spike.castShadow=true;parent.add(spike);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(13,.7,6,4),lit);
      ring.rotation.x=Math.PI/2;ring.rotation.y=Math.PI/4;ring.position.set(c.x,h+2,c.z);parent.add(ring);
    }
    const independent=named.get('The Independent');
    if(independent) {
      const c=centroid(independent.coordinates),h=independent.height||209;
      const slab=new THREE.MeshStandardMaterial({color:0xd5ddd8,roughness:.42,metalness:.22});
      for(let i=0;i<8;i++) {
        const shift=(i%2===0?1:-1)*(8+(i%3)*2);
        box(parent,c.x+shift,h*(.5+i*.055),c.z,24,Math.max(3.4,h*.032),20,slab,.2);
      }
    }
    const austonian=named.get('The Austonian');
    if(austonian) {
      const c=centroid(austonian.coordinates),h=austonian.height||190;
      const spireMat=new THREE.MeshStandardMaterial({color:0xd5dbd8,metalness:.35,roughness:.32});
      box(parent,c.x,h+7,c.z,11,14,11,spireMat);
      const tip=new THREE.Mesh(new THREE.ConeGeometry(3.4,22,8),spireMat);
      tip.position.set(c.x,h+24,c.z);tip.castShadow=true;parent.add(tip);
    }
    const cap=point([CAPITOL.lon,CAPITOL.lat]);
    const cx=cap.x,cz=cap.y;
    box(parent,cx,22,cz,128,44,84,granite);
    box(parent,cx,30,cz+46,48,58,24,granite);
    for(let i=-4;i<=4;i++) box(parent,cx+i*5,28,cz+62,1.6,46,1.6,granite);
    const pediment=new THREE.Mesh(new THREE.ConeGeometry(28,16,4),granite);
    pediment.position.set(cx,62,cz+56);pediment.rotation.y=Math.PI/4;parent.add(pediment);
    for(const side of [-1,1]) box(parent,cx+side*54,20,cz,42,34,56,granite);
    const drum=new THREE.Mesh(new THREE.CylinderGeometry(26,30,34,28),domeMat);
    drum.position.set(cx,78,cz);drum.castShadow=true;parent.add(drum);
    const dome=new THREE.Mesh(new THREE.SphereGeometry(42,36,20,0,Math.PI*2,0,Math.PI/2),domeMat);
    dome.position.set(cx,95,cz);dome.castShadow=true;parent.add(dome);
    const ribMat=new THREE.MeshStandardMaterial({color:0xf3e4d4,roughness:.5,emissive:0xc48a74,emissiveIntensity:.2});
    for(let i=0;i<10;i++){
      const rib=new THREE.Mesh(new THREE.BoxGeometry(.9,30,.9),ribMat);
      const a=i/10*Math.PI*2;
      rib.position.set(cx+Math.cos(a)*14,112,cz+Math.sin(a)*14);
      rib.lookAt(cx,112,cz);
      parent.add(rib);
    }
    const lantern=new THREE.Mesh(new THREE.CylinderGeometry(4.2,5.2,16,12),domeMat);
    lantern.position.set(cx,132,cz);parent.add(lantern);
    const statue=new THREE.Mesh(new THREE.ConeGeometry(1.8,18,6),statueMat);
    statue.position.set(cx,150,cz);parent.add(statue);
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
    streetSpots.length=0;
    dressed.clear();
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
    parkedTraffic(data.roads||[]);
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
      streetSpots.push({kind:'tree',x,z:z-40-seeded(i)*20,yaw:seeded(i)*Math.PI*2,seed:i*3});
      streetSpots.push({kind:'tree',x,z:z+210+seeded(i*8)*20,yaw:seeded(i*11)*Math.PI*2,seed:i*7});
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
      if(merged){meshes.forEach(mesh=>city.remove(mesh));const mesh=new THREE.Mesh(merged,material);mesh.castShadow=material.userData.castShadow!==false;mesh.receiveShadow=true;city.add(mesh);}
    }
    dressLandmarks(city,data);
    city.add(dressed);
  }
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dummy = new THREE.Object3D();
  function dress(assets: StreetAssets, quality: Quality): THREE.Object3D[] {
    dressed.clear();
    const budget = streetBudget(quality);
    const paints = [0xe8e4dc, 0x2c3338, 0x8d3a32, 0x1e2428, 0xd7d3c8, 0x4d5960, 0x6b7180, 0xc9c3b6, 0xbf5700, 0xdfe3e0];
    const south = new THREE.Vector2(80, -20);
    const downtown = new THREE.Vector2(165, -300);
    const spotDist = (spot: StreetSpot, hub: THREE.Vector2) => (spot.x - hub.x) ** 2 + (spot.z - hub.y) ** 2;
    const keep = (spot: StreetSpot, far: number) => spotDist(spot, south) < far * far || spotDist(spot, downtown) < far * far;
    const stride = Math.max(1, Math.round(budget.treeStride / 28));
    const trees = streetSpots.filter((s) => s.kind === 'tree').filter((_, i) => i % stride === 0);
    const leafCap = quality === 'ultra' ? 36 : quality === 'high' ? 24 : quality === 'medium' ? 14 : 0;
    const leafRadius = quality === 'medium' ? 110 : 170;
    const nearest = (spot: StreetSpot) => Math.min(spotDist(spot, south), spotDist(spot, downtown));
    const leafTrees = trees.filter((spot) => keep(spot, leafRadius)).sort((a, b) => nearest(a) - nearest(b)).slice(0, leafCap);
    const leafSet = new Set(leafTrees);
    const coneTrees = trees.filter((spot) => !leafSet.has(spot));
    leafTrees.forEach((spot) => tree(dressed, spot.x, spot.z, spot.seed));
    const treeScale = assets.propScale('tree', quality);
    const treeMesh = assets.instanceProp('tree', quality, coneTrees.length);
    if (treeMesh && treeScale) {
      coneTrees.forEach((spot, i) => {
        dummy.position.set(spot.x, treeScale.lift, spot.z);
        dummy.rotation.set(0, spot.yaw, 0);
        dummy.scale.setScalar(treeScale.scale * (0.86 + seeded(spot.seed) * 0.32));
        dummy.updateMatrix();
        treeMesh.setMatrixAt(i, dummy.matrix);
      });
      treeMesh.instanceMatrix.needsUpdate = true;
      dressed.add(treeMesh);
    } else if (!treeMesh) {
      coneTrees.forEach((spot) => tree(dressed, spot.x, spot.z, spot.seed));
    }
    function placeScan(kind: HeroKind, spot: StreetSpot, along: number, scale: number) {
      const model = assets.spawnHero(kind, scale);
      if (!model) return;
      const yaw = spot.yaw + Math.PI;
      const nx = Math.sin(yaw);
      const nz = Math.cos(yaw);
      model.position.set(spot.x + nx * along, 0, spot.z + nz * along);
      model.rotation.y = yaw;
      if (kind === 'facade') {
        model.traverse((obj) => {
          if (obj instanceof THREE.Mesh) obj.castShadow = false;
        });
      }
      dressed.add(model);
    }
    if (quality !== 'low') {
      const anchors = streetSpots.filter((s) => s.kind === 'tree' && keep(s, 240)).sort((a, b) => spotDist(a, south) - spotDist(b, south));
      const facadeCount = quality === 'ultra' ? 2 : 1;
      const escapeCount = quality === 'medium' ? 2 : 4;
      const shrubCount = quality === 'medium' ? 6 : 10;
      anchors.filter((_, i) => i % 5 === 0).slice(0, facadeCount).forEach((spot) => placeScan('facade', spot, 1.4, 1));
      anchors.filter((_, i) => i % 5 === 2).slice(0, escapeCount).forEach((spot) => placeScan('escape', spot, -1.8, 1));
      anchors.filter((_, i) => i % 3 === 1).slice(0, shrubCount).forEach((spot) => placeScan('shrub', spot, 0.2, 2.6));
    }
    const instanceKinds: PropKind[] = ['lamp', 'planter', 'stop', 'pole', 'cone', 'dumpster', 'signal', 'street-sign', 'warn'];
    for (const kind of instanceKinds) {
      const spots = streetSpots.filter((s) => s.kind === kind && keep(s, budget.propFar));
      if (!spots.length) continue;
      const metrics = assets.propScale(kind, quality);
      const mesh = assets.instanceProp(kind, quality, spots.length);
      if (mesh && metrics) {
        spots.forEach((spot, i) => {
          dummy.position.set(spot.x, metrics.lift, spot.z);
          dummy.rotation.set(0, spot.yaw, 0);
          dummy.scale.setScalar(metrics.scale);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        dressed.add(mesh);
      }
    }
    const unique: PropKind[] = ['bench', 'hydrant', 'trash'];
    for (const kind of unique) {
      streetSpots.filter((s) => s.kind === kind && keep(s, budget.scans ? budget.propFar : Math.min(90, budget.propFar))).forEach((spot) => {
        const model = assets.spawnProp(kind, quality);
        if (!model) return;
        model.position.set(spot.x, 0, spot.z);
        model.rotation.y = spot.yaw;
        dressed.add(model);
      });
    }
    const parks = streetSpots.filter((s) => s.kind === 'park').slice(0, budget.parked);
    const cars: THREE.Object3D[] = [];
    parks.forEach((spot, i) => {
      const mesh = assets.spawnCar(kindFromIndex(i), paints[i % paints.length]);
      mesh.position.set(spot.x, ROAD_Y, spot.z);
      mesh.rotation.y = spot.yaw;
      dressed.add(mesh);
      cars.push(mesh);
    });
    return cars;
  }
  const ready = (async () => {
    onStatus?.('Loading the map');
    let data: MapData | null = null;
    try { data = await loadMapData(); } catch { data = null; }
    onStatus?.('Building downtown');
    await new Promise<void>((resolve) => { setTimeout(resolve, 32); });
    if (data?.roads?.length && data.buildings?.length) render(data);
    else createFallback();
    await Promise.race([textureReady, new Promise<void>((resolve) => { setTimeout(resolve, 12000); })]);
  })();
  let time=0;
  return {
    city,
    ready,
    dress,
    update(dt:number) {
      time += dt;
      if (!reduceMotion) waterMaterial.roughness = 0.19 + Math.sin(time * 0.3) * 0.025;
    },
  };
}
