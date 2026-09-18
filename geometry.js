/* Source semantics checked against taibeled/JetLagHideAndSeek (see README sources).
   Approximate geometry is deliberately marked; permanentOverlay is not legal area. */
const emptyArea = () => turf.featureCollection([]);
function polygonUnion(g) {
  const fs = g?.type === 'FeatureCollection' ? g.features : [g?.type === 'Feature' ? g : turf.feature(g)];
  if (!fs.length) return null;
  if (fs.some(f => !['Polygon','MultiPolygon'].includes(f?.geometry?.type))) throw Error('Expected polygon geometry');
  turf.coordEach(turf.featureCollection(fs), c => { if (!c.every(Number.isFinite) || Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) throw Error('Invalid polygon coordinates'); });
  return fs.length === 1 ? fs[0] : turf.union(turf.featureCollection(fs));
}
function intersect(a,b) { return a && b ? turf.intersect(turf.featureCollection([a,b])) : null; }
function difference(a,b) { return a && b ? turf.difference(turf.featureCollection([a,b])) : a; }
function coordinate(lng,lat) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng)>180 || Math.abs(lat)>90) throw Error('Invalid question coordinates');
  return [lng,lat];
}
function circleFor(d) {
  if (!Number.isFinite(d.radius) || d.radius <= 0 || !['meters','kilometers','miles'].includes(d.unit)) throw Error('Invalid question radius or unit');
  return turf.circle(coordinate(d.lng,d.lat),d.radius,{units:d.unit,steps:256});
}
// Spherical equidistance boundary, sampled across the local Brisbane extent.
function halfPlane(d,bbox) {
  const a=coordinate(d.lngA,d.latA), b=coordinate(d.lngB,d.latB);
  const vector=p=>{const l=p[0]*Math.PI/180,t=p[1]*Math.PI/180;return [Math.cos(t)*Math.cos(l),Math.cos(t)*Math.sin(l),Math.sin(t)]};
  const av=vector(a),bv=vector(b), n=bv.map((v,i)=>(v-av[i])*(d.warmer===false?-1:1));
  if(Math.hypot(...n)<1e-12) throw Error('Thermometer points must be different');
  const score=p=>vector(p).reduce((s,v,i)=>s+v*n[i],0);
  const [w,s,e,north]=bbox, corners=[[w,s],[e,s],[e,north],[w,north]], ring=[];
  for(let i=0;i<4;i++) for(let j=0;j<256;j++){const p=corners[i],q=corners[(i+1)%4];ring.push([p[0]+(q[0]-p[0])*j/256,p[1]+(q[1]-p[1])*j/256]);}
  const out=[];
  for(let i=0;i<ring.length;i++) {const p=ring[i],q=ring[(i+1)%ring.length],sp=score(p),sq=score(q);if(sp>=0)out.push(p);if((sp>=0)!==(sq>=0)){let lo=0,hi=1;for(let k=0;k<45;k++){let m=(lo+hi)/2,sm=score([p[0]+(q[0]-p[0])*m,p[1]+(q[1]-p[1])*m]);if((sm>=0)===(sp>=0))lo=m;else hi=m;}const t=(lo+hi)/2;out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}}
  if(out.length<3)return null;
  // Densify spherical boundary between the two crossing points using great-circle interpolation.
  const dense=[];for(let i=0;i<out.length;i++){const p=out[i],q=out[(i+1)%out.length];dense.push(p);if(Math.abs(score(p))<1e-10&&Math.abs(score(q))<1e-10&&turf.distance(p,q)>0.1){const dist=turf.distance(p,q),bearing=turf.bearing(p,q);for(let j=1;j<256;j++)dense.push(turf.destination(p,dist*j/256,bearing).geometry.coordinates);}}
  dense.push(dense[0]);return turf.polygon([dense]);
}
function parseTaibeled(j) {
  if(!j || typeof j!=='object')throw Error('Expected a Taibeled JSON export');
  validateImportComplexity(j);
  const notes=[],unsupported=[];
  let area;
  if(['Polygon','MultiPolygon'].includes(j.geometry?.type)||j.type==='FeatureCollection') area=polygonUnion(j);
  else {
    const e=j.properties?.extent;
    if(!Array.isArray(e)||e.length!==4||!e.every(Number.isFinite))throw Error('Export has no polygon or recognised Taibeled extent');
    coordinate(e[1],e[0]);coordinate(e[3],e[2]);
    area=turf.bboxPolygon([Math.min(e[1],e[3]),Math.min(e[0],e[2]),Math.max(e[1],e[3]),Math.max(e[0],e[2])]);
    notes.push('Approximate boundary: export extent only, not the actual OSM game boundary');
  }
  if(j.alternateLocations?.length)notes.push('Additional game boundaries are not applied');
  if(j.properties?.isHidingZone)notes.push('Station hiding-zone restrictions are not applied');
  const qs=j.properties?.questions??j.questions??[];
  if(!Array.isArray(qs)||qs.length>100)throw Error('Expected at most 100 questions');
  let count=0;
  for(const q of qs) {
    const d=q?.data;if(!d)throw Error('Invalid question data');if(d.hidden)continue;
    if(q.id==='radius'||(q.id==='tentacles'&&d.location===false)) {
      const c=circleFor(d);area=q.id==='tentacles'||d.within===false?difference(area,c):intersect(area,c);count++;
    } else if(q.id==='thermometer') {if(area)area=intersect(area,halfPlane(d,turf.bbox(area)));count++;
    } else if(q.id==='matching'&&d.type==='custom-zone') {const region=polygonUnion(d.geo);area=d.same===false?difference(area,region):intersect(area,region);count++;
    } else unsupported.push(`${q.id}${d.type?': '+d.type:''}`);
  }
  if(j.permanentOverlay)notes.push('Display-only permanentOverlay is not used as legal area');
  if(qs.length)notes.push('Question geometry is sampled; planning-mode state is not included in exports');
  return {geom:area||emptyArea(),notes,unsupported,count};
}
function clipTransit(data,area) {
  if(!area || (area.type==='FeatureCollection'&&!area.features.length))return emptyArea();
  const poly=polygonUnion(area),out=[];
  for(const f of data.features) {
    if(f.geometry.type==='Point'){if(turf.booleanPointInPolygon(f,poly))out.push(f);continue;}
    turf.flattenEach(f,line=>{
      if(line.geometry.type!=='LineString')return;
      // GTFS shapes can repeat consecutive coordinates; zero-length segments break lineSplit.
      const coords=line.geometry.coordinates.filter((c,i,a)=>i===0||c[0]!==a[i-1][0]||c[1]!==a[i-1][1]);
      if(coords.length<2)return;
      line=turf.lineString(coords,line.properties);
      const cuts=turf.lineSplit(line,poly);
      for(const part of cuts.features.length?cuts.features:[line]) {
        const mid=turf.along(part,turf.length(part)/2);
        if(turf.booleanPointInPolygon(mid,poly))out.push({...part,properties:f.properties});
      }
    });
  }
  return turf.featureCollection(out);
}

// Bound work before calling geometry libraries on user-selected JSON.
function validateImportComplexity(root) {
  const pending=[[root,0]];let nodes=0;
  while(pending.length){
    const [value,depth]=pending.pop();
    if(++nodes>50000||depth>32)throw Error('Export is too complex');
    if(value&&typeof value==='object'){
      for(const [key,child] of Object.entries(value)){
        if(['__proto__','constructor','prototype'].includes(key))throw Error('Unsafe property in export');
        pending.push([child,depth+1]);
      }
    }
  }
}
