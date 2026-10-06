# Camera model fitted to "Tesla Cybercab - San Francisco - June 2026" (1024x683 thumbnail coords)
import math
F=2908.0; CX,CY=512.0,341.0; HC=0.921; YC=0.02
A=math.atan(12.4/511)  # image roll
def unroll(x,y):
    dx,dy=x-CX,y-CY
    return dx*math.cos(A)+dy*math.sin(A), -dx*math.sin(A)+dy*math.cos(A)
def to_model(x,y,depth):
    u,v=unroll(x,y)
    return YC+u*depth/F, HC-v*depth/F
if __name__=='__main__':
    top=[(113,338),(142,326),(184,314),(226,299),(268,284),(310,272),(352,263),(394,256),(436,252),(478,249),(520,248),(542,252),(584,259),(626,276),(668,303),(689,320),(710,335),(735,343),(752,346),(794,356),(836,369),(878,385),(899,396),(908,405)]
    print('TOP (center plane d=15.88)')
    for p in top: print(p, ['%.3f'%v for v in to_model(*p,15.88)])
    side={'rocker':[(342,444),(451,449),(552,456),(678,460)],'rocker_bot':[(400,483),(600,488)],'arch':[(259,358),(770,372)],'wheelc':[(259,440.6),(770,453)],
     'qwin_bot':[(297,289),(402,316)],'win_bot':[(410,325),(630,335)],'apillar':[(630,335),(590,262)],'wintop':[(420,262),(590,262)],'door_rear':[(410,258),(445,452)],
     'cam':[(715,375)],'lightbar_side':[(860,393),(900,398)],'rear_lamp_low':[(110,418),(150,422)],'rearbumper_bot':[(140,463)],'chin_bot':[(880,465)],'front_black_top':[(890,445)]}
    for k,v in side.items():
        print(k,[tuple('%.3f'%c for c in to_model(*p,15.0)) for p in v])
