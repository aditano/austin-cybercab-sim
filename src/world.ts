import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAPITOL, ROAD_Y } from './geo';
import type { StreetAssets, PropKind } from './assets';
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
  const asphalt=texturedMaterial(0x8d9296,asphaltDiff,asphaltNor,asphaltRough,.42,0.34,true);
  (asphalt as THREE.MeshPhysicalMaterial).metalness=0.28;
  (asphalt as THREE.MeshPhysicalMaterial).envMapIntensity=1.45;
  (asphalt as THREE.MeshPhysicalMaterial).clearcoat=0.35;
  (asphalt as THREE.MeshPhysicalMaterial).clearcoatRoughness=0.22;
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
  function pbrMap(file:string, srgb:boolean) {
    const texture=texLoader.load(`${import.meta.env.BASE_URL}textures/facades/${file}`);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.anisotropy=coarse?4:16;
    texture.generateMipmaps=true;
    texture.minFilter=THREE.LinearMipmapLinearFilter;
    texture.magFilter=THREE.LinearFilter;
    texture.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;
    return texture;
  }
  const stoneColor=pbrMap('stone-color.jpg',true), stoneNor=pbrMap('stone-normal.jpg',false), stoneRough=pbrMap('stone-rough.jpg',false);
  const brickColor=pbrMap('brick-color.jpg',true), brickNor=pbrMap('brick-normal.jpg',false), brickRough=pbrMap('brick-rough.jpg',false);
  const plasterColor=pbrMap('plaster-color.jpg',true), plasterNor=pbrMap('plaster-normal.jpg',false), plasterRough=pbrMap('plaster-rough.jpg',false);
  const roofMap=pbrMap('roof.jpg',true);
  type WallMaps = { color: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture; scaleU: number; scaleV: number; bay: number; floorH: number; curtain: boolean };
  const wallSets: WallMaps[] = [
    { color: stoneColor, normal: stoneNor, rough: stoneRough, scaleU: 0.36, scaleV: 0.72, bay: 2.7, floorH: 3.35, curtain: false },
    { color: brickColor, normal: brickNor, rough: brickRough, scaleU: 1.05, scaleV: 1.05, bay: 2.25, floorH: 3.15, curtain: false },
    { color: plasterColor, normal: plasterNor, rough: plasterRough, scaleU: 0.48, scaleV: 0.48, bay: 3.05, floorH: 3.5, curtain: false },
    { color: stoneColor, normal: stoneNor, rough: stoneRough, scaleU: 0.34, scaleV: 0.68, bay: 1.85, floorH: 3.6, curtain: true },
    { color: plasterColor, normal: plasterNor, rough: plasterRough, scaleU: 0.32, scaleV: 0.32, bay: 2.05, floorH: 3.8, curtain: true },
  ];
  // Punched windows on a PBR wall. Dark texels are not recolored, so the facade cannot turn into a blue/beige checker.
  function makeFacade(index:number) {
    const set=wallSets[index%wallSets.length];
    const material=new THREE.MeshStandardMaterial({
      map:set.color, normalMap:set.normal, roughnessMap:set.rough,
      color:set.curtain?0xd5ddd8:0xffffff, roughness:set.curtain?0.55:0.86, metalness:set.curtain?0.18:0.02, envMapIntensity:0.9,
    });
    material.normalScale=new THREE.Vector2(set.curtain?0.35:0.85, set.curtain?0.35:0.85);
    const key=`wall-${index}-${set.scaleU}-${set.bay}-${set.curtain?1:0}`;
    material.onBeforeCompile=shader=>{
      shader.uniforms.roofMap={value:roofMap};
      shader.vertexShader='varying vec3 vSurfacePosition;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        vec4 surfacePosition=vec4(transformed,1.0);
        #ifdef USE_INSTANCING
          surfacePosition=instanceMatrix*surfacePosition;
        #endif
        vSurfacePosition=(modelMatrix*surfacePosition).xyz;`);
      shader.fragmentShader='uniform sampler2D roofMap;\nvarying vec3 vSurfacePosition;\n'+shader.fragmentShader;
      const sample=`
        vec3 geomN=normalize(cross(dFdx(vSurfacePosition),dFdy(vSurfacePosition)));
        float roof=smoothstep(0.5,0.82,abs(geomN.y));
        float xWall=step(abs(geomN.z),abs(geomN.x));
        float along=mix(vSurfacePosition.x,vSurfacePosition.z,xWall);
        float up=vSurfacePosition.y;
        vec2 wallUv=vec2(along*${set.scaleU.toFixed(4)}, up*${set.scaleV.toFixed(4)});
        vec3 brick=texture2D(map,wallUv).rgb;
        brick=clamp((brick-0.42)*1.45+0.42,0.0,1.0);
        float brickRough=texture2D(roughnessMap,wallUv).g;
        vec3 nTex=texture2D(normalMap,wallUv).xyz*2.0-1.0;
        vec3 upRef=abs(geomN.y)>0.85?vec3(1.0,0.0,0.0):vec3(0.0,1.0,0.0);
        vec3 tangent=normalize(cross(upRef,geomN));
        vec3 bitangent=cross(geomN,tangent);
        vec3 mappedN=normalize(tangent*nTex.x+bitangent*nTex.y+geomN*nTex.z);
        float bay=${set.bay.toFixed(3)};
        float floorH=${set.floorH.toFixed(3)};
        float row=floor(up/floorH);
        float jitter=fract(sin((row+${index}.0)*17.13)*43.758)*0.55;
        float fx=fract((along+${(index*1.37).toFixed(3)}+jitter)/bay);
        float fy=fract(up/floorH);
        float pier=smoothstep(0.0,${set.curtain?'0.32':'0.12'},fx)*smoothstep(0.0,${set.curtain?'0.32':'0.12'},1.0-fx);
        float sill=smoothstep(${set.curtain?'0.04':'0.18'},${set.curtain?'0.46':'0.30'},fy)*smoothstep(${set.curtain?'0.08':'0.16'},${set.curtain?'0.40':'0.28'},1.0-fy);
        float punched=pier*sill;
        float shopFx=fract(along/3.35);
        float shopPier=smoothstep(0.04,0.1,shopFx)*smoothstep(0.04,0.1,1.0-shopFx);
        float shop=shopPier*smoothstep(0.25,0.55,up)*(1.0-smoothstep(3.15,3.55,up));
        float glassMix=${set.curtain?'mix(shop,pier*sill,step(4.0,up))':'mix(shop,punched,step(3.7,up))'};
        glassMix*=(1.0-roof);
        vec3 viewDir=normalize(cameraPosition-vSurfacePosition);
        float fres=pow(1.0-clamp(abs(dot(normalize(mappedN),viewDir)),0.0,1.0),2.2);
        vec3 glassCol=mix(vec3(0.035,0.045,0.05),vec3(0.62,0.68,0.7),fres*0.62);
        float pane=floor(along/bay)+floor(up/floorH)*13.0;
        float warm=step(0.82,fract(sin(pane*12.9898)*43758.5453));
        glassCol=mix(glassCol,vec3(0.62,0.36,0.16),warm*0.28*step(4.2,up));
        vec3 roofCol=texture2D(roofMap,vSurfacePosition.xz*0.09).rgb;
        vec3 albedo=mix(mix(brick,glassCol,glassMix),roofCol,roof);
        diffuseColor=vec4(albedo,1.0);
        roughnessFactor=mix(roughness*brickRough,0.045,glassMix);
        roughnessFactor=mix(roughnessFactor,0.78,roof);
        normal=normalize(mix(normal,mappedN,0.8*(1.0-glassMix)*(1.0-roof)));
      `;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','');
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','float roughnessFactor=roughness;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>', sample);
    };
    material.customProgramCacheKey=()=>key;
    return material;
  }
  const facadeMaterials=wallSets.map((_,index)=>makeFacade(index));
  const manholeCanvas=document.createElement('canvas');manholeCanvas.width=manholeCanvas.height=128;
  const manholeCtx=manholeCanvas.getContext('2d')!;
  manholeCtx.fillStyle='#2e3336';manholeCtx.beginPath();manholeCtx.arc(64,64,60,0,Math.PI*2);manholeCtx.fill();
  manholeCtx.strokeStyle='#8b9296';manholeCtx.lineWidth=5;manholeCtx.stroke();
  manholeCtx.strokeStyle='#1c2124';manholeCtx.lineWidth=2;
  for(let ring=0;ring<5;ring++){manholeCtx.beginPath();manholeCtx.arc(64,64,16+ring*8,0,Math.PI*2);manholeCtx.stroke();}
  const manholeTex=new THREE.CanvasTexture(manholeCanvas);manholeTex.colorSpace=THREE.SRGBColorSpace;
  const manholeMat=new THREE.MeshStandardMaterial({map:manholeTex,roughness:0.48,metalness:0.62,polygonOffset:true,polygonOffsetFactor:-2});
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
        if(/Congress Avenue/.test(f.name||''))for(const side of [-1,1])strip(parent,center.clone().addScaledVector(normal,side*(width/2-1.7)),end.clone().addScaledVector(normal,side*(width/2-1.7)),.12,.17,stripe,.02);
        if(Math.floor((travelled+d)/12)%2===0)for(const offset of major?[-width*.25,width*.25]:[0])strip(parent,center.clone().addScaledVector(normal,offset),end.clone().addScaledVector(normal,offset),.12,.165,stripe,.012);
      }
      if(major)for(let d=12;d<len-8;d+=28) {
        const congress=/Congress Avenue/.test(f.name||'');
        const sides=congress?[-1,1]:[1];
        const v=a.clone().addScaledVector(direction,d).addScaledVector(normal,width*.5+4.4);
        if(nearJunction(v,22))continue;
        const yaw=Math.atan2(-direction.y,direction.x);
        const seed=d+i*12;
        for(const side of sides) {
          const spot=a.clone().addScaledVector(direction,d).addScaledVector(normal,side*(width*.5+3.8));
          if(nearJunction(spot,16)) continue;
          box(parent,spot.x,.09,spot.y,2.1,.16,2.1,lawn);
          streetSpots.push({kind:'tree',x:spot.x,z:spot.y,yaw,seed:seed+side*17});
          const hero=(spot.x-80)**2+(spot.y+20)**2<175*175;
          if(congress && hero && Math.floor(d/14)%2===0) {
            const mid=a.clone().addScaledVector(direction,d+7).addScaledVector(normal,side*(width*.5+3.8));
            streetSpots.push({kind:'tree',x:mid.x,z:mid.y,yaw,seed:seed+40+side});
          }
        }
        const p=a.clone().addScaledVector(direction,d+12).addScaledVector(normal,width*.5+1.1);
        streetSpots.push({kind:'lamp',x:p.x,z:p.y,yaw:Math.atan2(-normal.y,normal.x),seed:seed+3});
        const seat=v.clone().addScaledVector(direction,4);
        streetSpots.push({kind:'bench',x:seat.x,z:seat.y,yaw,seed:seed+7});
        if(Math.floor(d/28)%3===0) streetSpots.push({kind:'planter',x:v.x+normal.x*1.6,z:v.y+normal.y*1.6,yaw,seed:seed+9});
        if(Math.floor(d/28)%4===1) streetSpots.push({kind:'hydrant',x:p.x+normal.x*0.6,z:p.y+normal.y*0.6,yaw,seed:seed+11});
        if(Math.floor(d/28)%5===2) streetSpots.push({kind:'trash',x:seat.x-direction.x*2.2,z:seat.y-direction.y*2.2,yaw,seed:seed+13});
        // Kenney stop/warn glTFs are integer-quantized. Instancing them at street scale
        // produced the giant orange octagon, so they are not placed.
      }
      travelled+=len;
    }
  }
  const awnings: { x:number; z:number; yaw:number; width:number }[] = [];
  const shopSigns: { x:number; z:number; yaw:number; text:string }[] = [];
  const shopNames = ['COFFEE','BOOKS','MARKET','HOTEL','GALLERY','DINER','FLORIST','NEWS'];
  function building(parent:THREE.Object3D,f:Feature,index:number) {
    const h=Math.min(250,Math.max(4,Number(f.height)||Number(f.levels)*3.5||8+seeded(index)*12));
    const tall=h>26;
    const palette=tall?[3,4]:[0,1,2];
    const material=facadeMaterials[palette[index%palette.length]];
    const result=polygon(parent,f.coordinates,h,material,0);if(!result)return;
    const pts=result.pts;
    const center=pts.reduce((v,p)=>v.add(p),new THREE.Vector2()).multiplyScalar(1/pts.length);
    const nearHub=(center.x-80)**2+(center.y+20)**2<150*150 || (center.x-165)**2+(center.y+300)**2<120*120;
    if(nearHub) {
      for(let e=1;e<pts.length;e++) {
        const a=pts[e-1],b=pts[e],length=a.distanceTo(b);
        if(length<8||length>42||awnings.length>=28) continue;
        const yaw=Math.atan2(-(b.y-a.y),b.x-a.x);
        const nx=-Math.sin(yaw), nz=-Math.cos(yaw);
        awnings.push({ x:(a.x+b.x)/2+nx*1.05, z:(a.y+b.y)/2+nz*1.05, yaw, width:Math.min(length-0.4,16) });
        if(shopSigns.length<8 && length>10) shopSigns.push({ x:(a.x+b.x)/2+nx*1.2, z:(a.y+b.y)/2+nz*1.2, yaw, text:shopNames[shopSigns.length%shopNames.length] });
      }
    }
    if(h>16) {
      for(let e=1;e<pts.length;e++) {
        const a=pts[e-1],b=pts[e],length=a.distanceTo(b);if(length<1||length>350)continue;
        box(parent,(a.x+b.x)/2,h+.28,(a.y+b.y)/2,length,.56,.42,material,Math.atan2(-(b.y-a.y),b.x-a.x));
      }
    }
    if(h>48) {
      const c=pts.reduce((v,p)=>v.add(p),new THREE.Vector2()).multiplyScalar(1/pts.length);
      box(parent,c.x,h+1.5,c.y,Math.min(14,6+h*0.02),2.4,Math.min(12,5+h*0.015),material);
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
      const signal=corner.clone().addScaledVector(across,-side*6.4);
      box(parent,(corner.x+signal.x)/2,5.9,(corner.y+signal.y)/2,6.6,.12,.12,metal,Math.atan2(-across.y,across.x));
      box(parent,signal.x,5.25,signal.y,.4,1.1,.35,metal);
      const lenses=[{y:5.52,color:0x8a3030,emissive:0x3a1010,on:0},{y:5.25,color:0xdca65a,emissive:0xcb8729,on:.15},{y:4.98,color:0x2f8a48,emissive:0x1f6a32,on:.45}];
      for(const lens of lenses) {
        const light=new THREE.Mesh(new THREE.CircleGeometry(.09,12),new THREE.MeshStandardMaterial({color:lens.color,emissive:lens.emissive,emissiveIntensity:lens.on}));
        light.position.set(signal.x,lens.y,signal.y+.2);parent.add(light);
      }
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
  function projectTheatre(lon:number, lat:number) { return point([lon, lat]); }
  function marquee(parent:THREE.Object3D, x:number, z:number, title:string, yaw:number) {
    const canvas=document.createElement('canvas'); canvas.width=1024; canvas.height=256;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#140c08'; ctx.fillRect(0,0,1024,256);
    ctx.strokeStyle='#f2d48a'; ctx.lineWidth=18; ctx.strokeRect(18,18,988,220);
    ctx.fillStyle='#ffe7a3';
    for(let i=48;i<1000;i+=34){ ctx.beginPath(); ctx.arc(i,36,8,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(i,220,8,0,Math.PI*2); ctx.fill(); }
    ctx.fillStyle='#f6e7b0'; ctx.font='700 118px Georgia, serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(title,512,128);
    const tex=new THREE.CanvasTexture(canvas); tex.colorSpace=THREE.SRGBColorSpace; tex.anisotropy=8;
    const board=new THREE.Mesh(new THREE.BoxGeometry(8.6,2.15,0.38), new THREE.MeshStandardMaterial({map:tex,emissive:0x4a3214,emissiveMap:tex,emissiveIntensity:0.45,roughness:0.42,metalness:0.04}));
    board.position.set(x,8.4,z); board.rotation.y=yaw; board.castShadow=true; parent.add(board);
    const stem=new THREE.Mesh(new THREE.BoxGeometry(0.18,3.6,0.18), metal);
    stem.position.set(x,5.4,z); stem.castShadow=true; parent.add(stem);
  }
  function render(data:MapData) {
    city.clear();
    streetSpots.length=0;
    awnings.length=0;
    shopSigns.length=0;
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
    if(awnings.length) {
      const awningMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.74,metalness:0.02});
      const awningMesh=new THREE.InstancedMesh(boxGeometry,awningMat,awnings.length);
      const awningDummy=new THREE.Object3D();
      const awningTints=[0x1f4d3a,0x6e2430,0x1c3a5a,0xc4a574,0x243026];
      awnings.forEach((awning,i)=>{
        awningDummy.position.set(awning.x,2.85,awning.z);
        awningDummy.rotation.set(0,awning.yaw,0);
        awningDummy.scale.set(awning.width,0.07,1.2);
        awningDummy.updateMatrix();
        awningMesh.setMatrixAt(i,awningDummy.matrix);
        awningMesh.setColorAt(i,new THREE.Color(awningTints[i%awningTints.length]));
      });
      awningMesh.castShadow=true;awningMesh.receiveShadow=true;awningMesh.frustumCulled=false;city.add(awningMesh);
    }
    for(const sign of shopSigns) {
      const board=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(3.2,2.2),0.55),signTexture(sign.text,'#1b1a17'));
      board.position.set(sign.x,3.55,sign.z);
      board.rotation.y=sign.yaw;
      city.add(board);
    }
    const paramount=projectTheatre(-97.7418633,30.2693791);
    const stateTheatre=projectTheatre(-97.7418048,30.2695354);
    marquee(city,paramount.x,paramount.y,'PARAMOUNT',Math.PI/2);
    marquee(city,stateTheatre.x,stateTheatre.y,'STATE',Math.PI/2);
    let holes=0;
    for(const spot of streetSpots) {
      if(spot.kind!=='lamp'||holes>=10) continue;
      if((spot.x-80)**2+(spot.z+20)**2>140*140 && (spot.x-165)**2+(spot.z+300)**2>140*140) continue;
      const lid=new THREE.Mesh(new THREE.CircleGeometry(0.58,16),manholeMat);
      lid.rotation.x=-Math.PI/2;
      lid.position.set(spot.x+Math.sin(spot.yaw)*2.4,0.172,spot.z+Math.cos(spot.yaw)*2.4);
      city.add(lid);
      holes++;
    }
    city.add(dressed);
  }
  function makeScooter() {
    const deck=new THREE.BoxGeometry(0.16,0.045,0.9); deck.translate(0,0.18,0);
    const stem=new THREE.BoxGeometry(0.04,0.82,0.04); stem.translate(0,0.58,0.36);
    const bar=new THREE.BoxGeometry(0.42,0.03,0.04); bar.translate(0,0.98,0.36);
    const wheel=new THREE.CylinderGeometry(0.11,0.11,0.04,10); wheel.rotateZ(Math.PI/2);
    const front=wheel.clone(); front.translate(0,0.12,0.4);
    const rear=wheel.clone(); rear.translate(0,0.12,-0.38);
    return mergeGeometries([deck,stem,bar,front,rear]) ?? deck;
  }
  function canopyTexture() {
    const canvas=document.createElement('canvas'); canvas.width=canvas.height=256;
    const ctx=canvas.getContext('2d')!;
    ctx.clearRect(0,0,256,256);
    for(let i=0;i<160;i++) {
      const x=128+(seeded(i*3)-0.5)*210;
      const y=128+(seeded(i*5)-0.5)*190;
      ctx.fillStyle=`rgba(${40+(seeded(i*9)*30)|0},${86+(seeded(i*11)*48)|0},${32+(seeded(i*13)*16)|0},0.9)`;
      ctx.beginPath();
      ctx.ellipse(x,y,16+seeded(i*17)*30,8+seeded(i*19)*14,seeded(i*23)*3,0,Math.PI*2);
      ctx.fill();
    }
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=8;
    texture.needsUpdate=true;
    return texture;
  }
  const canopyMap=canopyTexture();
  const scooterGeometry=makeScooter();
  const scooterMat=new THREE.MeshStandardMaterial({color:0x2a3134,metalness:0.4,roughness:0.42});
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dummy = new THREE.Object3D();
  function placeOaks(parent:THREE.Object3D, spots:StreetSpot[], quality:Quality) {
    if(!spots.length) return;
    const cards=quality==='low'?5:quality==='medium'?10:quality==='high'?12:14;
    const trunkGeo=new THREE.CylinderGeometry(0.22,0.42,1,6); trunkGeo.translate(0,0.5,0);
    const oakLeaf=new THREE.MeshStandardMaterial({map:canopyMap,alphaTest:0.2,side:THREE.DoubleSide,roughness:0.86,color:0xffffff});
    const trunks=new THREE.InstancedMesh(trunkGeo,trunkMat,spots.length);
    const leaves=new THREE.InstancedMesh(leafCard,oakLeaf,spots.length*cards);
    const shade=new THREE.InstancedMesh(new THREE.CircleGeometry(1,12), new THREE.MeshBasicMaterial({color:0x1c2618,transparent:true,opacity:0.32,depthWrite:false}), spots.length);
    trunks.castShadow=quality!=='low'; trunks.receiveShadow=true; trunks.frustumCulled=false;
    leaves.castShadow=quality==='high'||quality==='ultra'; leaves.receiveShadow=false; leaves.frustumCulled=false;
    shade.frustumCulled=false; shade.renderOrder=2;
    let leafIndex=0;
    spots.forEach((spot,i)=>{
      const trunkH=2.15+seeded(spot.seed)*0.7;
      const crown=5.2+seeded(spot.seed+3)*1.6;
      dummy.position.set(spot.x,0,spot.z); dummy.rotation.set(0,spot.yaw,0); dummy.scale.set(1,trunkH,1); dummy.updateMatrix();
      trunks.setMatrixAt(i,dummy.matrix);
      for(let c=0;c<cards;c++) {
        const ang=seeded(spot.seed+c*19)*Math.PI*2;
        const rad=(0.28+seeded(spot.seed+c*7)*0.9)*crown*0.52;
        dummy.position.set(spot.x+Math.cos(ang)*rad, trunkH+0.55+seeded(spot.seed+c*5)*2.3, spot.z+Math.sin(ang)*rad*0.82);
        dummy.rotation.set((seeded(spot.seed+c)-0.5)*0.7, ang, (seeded(spot.seed+c*3)-0.5)*0.45);
        dummy.scale.set(crown*(0.7+seeded(spot.seed+c)*0.22), crown*0.4, 1);
        dummy.updateMatrix();
        leaves.setMatrixAt(leafIndex++, dummy.matrix);
      }
      dummy.position.set(spot.x,0.175,spot.z);
      dummy.rotation.set(-Math.PI/2,0,spot.yaw);
      dummy.scale.set(crown*0.9, crown*0.7, 1);
      dummy.updateMatrix();
      shade.setMatrixAt(i, dummy.matrix);
    });
    trunks.instanceMatrix.needsUpdate=true;
    leaves.instanceMatrix.needsUpdate=true;
    shade.instanceMatrix.needsUpdate=true;
    parent.add(trunks, leaves);
    if(quality==='low'||quality==='medium') parent.add(shade);
  }
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
    const oakCap = quality === 'ultra' ? 56 : quality === 'high' ? 40 : quality === 'medium' ? 28 : 12;
    const oakRadius = quality === 'low' ? 90 : quality === 'medium' ? 175 : 230;
    const nearest = (spot: StreetSpot) => Math.min(spotDist(spot, south), spotDist(spot, downtown));
    const oakTrees = trees.filter((spot) => keep(spot, oakRadius)).sort((a, b) => nearest(a) - nearest(b)).slice(0, oakCap);
    const oakSet = new Set(oakTrees);
    const coneTrees = trees.filter((spot) => !oakSet.has(spot));
    placeOaks(dressed, oakTrees, quality);
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
    const instanceKinds: PropKind[] = ['lamp', 'planter', 'pole', 'cone', 'dumpster', 'signal'];
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
    const inLens = (x: number, z: number) => (x - 80) ** 2 + (z + 20) ** 2 < 3.2 * 3.2;
    const parks = streetSpots.filter((s) => s.kind === 'park' && !inLens(s.x, s.z)).slice(0, budget.parked);
    const scooterSpots = streetSpots.filter((s) => s.kind === 'tree' && spotDist(s, south) < 110 * 110).filter((_, i) => i % 5 === 1).slice(0, quality === 'low' ? 3 : 8);
    scooterSpots.forEach((spot) => {
      const scooter = new THREE.Mesh(scooterGeometry, scooterMat);
      scooter.position.set(spot.x + Math.sin(spot.yaw) * 1.15, ROAD_Y, spot.z + Math.cos(spot.yaw) * 1.15);
      scooter.rotation.y = spot.yaw + 0.4;
      scooter.castShadow = quality !== 'low';
      dressed.add(scooter);
    });
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
