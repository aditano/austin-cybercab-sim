import xml.etree.ElementTree as E,json,re,sys
from pathlib import Path
if len(sys.argv)!=3: raise SystemExit('Usage: python3 docs/import_map.py austin.osm austin-lake.osm')
r=E.parse(sys.argv[1]).getroot(); lake=E.parse(sys.argv[2]).getroot()
nodes={x.get('id'):[round(float(x.get('lon')),7),round(float(x.get('lat')),7)] for root in [r,lake] for x in root.findall('node')}
ways={x.get('id'):x for root in [r,lake] for x in root.findall('way')}
def tags(w):return {x.get('k'):x.get('v') for x in w.findall('tag')}
def points(w):return [nodes[n.get('ref')] for n in w.findall('nd') if n.get('ref') in nodes]
def number(v):
 try:return float(re.search(r'[\d.]+',v).group())
 except:return None
def intersects(p):return any(-97.754<=x<=-97.738 and 30.252<=y<=30.272 for x,y in p)
d={'attribution':'© OpenStreetMap contributors','license':'ODbL 1.0','licenseUrl':'https://www.openstreetmap.org/copyright','source':'https://api.openstreetmap.org/api/0.6/map?bbox=-97.754,30.252,-97.738,30.272','fetchedAt':'2026-10-05','bbox':[-97.754,30.252,-97.738,30.272],'origin':[-97.745,30.264],'roads':[],'buildings':[],'water':[]}
allowed={'motorway','trunk','primary','secondary','tertiary','residential','unclassified','living_street','service','motorway_link','trunk_link','primary_link','secondary_link','tertiary_link','pedestrian'}
for id,w in ways.items():
 t=tags(w);p=points(w)
 if not intersects(p):continue
 if t.get('highway') in allowed:d['roads'].append({'id':int(id),'name':t.get('name',''),'kind':t['highway'],'lanes':number(t.get('lanes','')),'oneway':t.get('oneway','no'),'bridge':t.get('bridge','no'),'coordinates':p})
 if 'building' in t and len(p)>3 and p[0]==p[-1]:
  levels=number(t.get('building:levels',''));height=number(t.get('height',''));source='height tag' if height else 'levels × 3.4 m' if levels else 'estimated default'
  if height and 'ft' in t.get('height',''):height*=.3048
  d['buildings'].append({'id':int(id),'name':t.get('name',''),'height':round(height or (levels*3.4 if levels else 10),2),'heightSource':source,'levels':levels,'coordinates':p})
 if t.get('natural')=='water' and len(p)>3 and p[0]==p[-1]:d['water'].append({'id':int(id),'name':t.get('name',''),'coordinates':p})
# Assemble all outer shoreline ways in order. Lake islands omitted for this rendering extract.
rel=lake.find('relation');segments=[]
for m in rel.findall('member'):
 if m.get('role')=='outer':segments.append(points(ways[m.get('ref')]))
ring=segments.pop(0)
while segments:
 for i,s in enumerate(segments):
  if ring[-1]==s[0]:ring+=s[1:];segments.pop(i);break
  if ring[-1]==s[-1]:ring+=s[-2::-1];segments.pop(i);break
 else:raise Exception('Unjoined shoreline')
d['water'].append({'id':32671,'name':'Lady Bird Lake','osmType':'relation','coordinates':ring})
Path('public/data/austin.json').write_text(json.dumps(d,separators=(',',':'))+'\n')
print({k:len(d[k]) for k in ['roads','buildings','water']});print('bytes',Path('public/data/austin.json').stat().st_size)
