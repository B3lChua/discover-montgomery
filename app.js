const map = L.map('map',{zoomControl:false,attributionControl:true}).setView([32.375,-86.295],13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:'&copy; OpenStreetMap &copy; CARTO',maxZoom:18}).addTo(map);
L.control.zoom({position:'bottomleft'}).addTo(map);

let circles=[], activeHood=null, activeLayer='vitality', charts={}, activeQuestion=null;
const comparisonHoods = new Set();

/* ═══════════════════════════════════════════════════
   COLOR SCALES (data layers — traffic light)
   ═══════════════════════════════════════════════════ */
const LAYER_NAMES = {vitality:'Business Vitality',safety:'Safety Profile',spaces:'Parks & Trails',development:'Development',civic:'311 Civic'};

function getLayerColor(hood, layer) {
  switch(layer) {
    case 'vitality': return hood.business.netGrowth>=8?'#38a169':hood.business.netGrowth>=5?'#d69e2e':'#e53e3e';
    case 'safety': return hood.safety.crimeRate<=20?'#38a169':hood.safety.crimeRate<=35?'#d69e2e':'#e53e3e';
    case 'spaces': { const a=hood.spaces.list.reduce((s,x)=>s+x.util,0)/(hood.spaces.list.length||1); return a>=65?'#38a169':a>=45?'#d69e2e':'#e53e3e'; }
    case 'development': return hood.development.permits>=15?'#dd6b20':hood.development.permits>=8?'#d69e2e':'#718096';
    case 'civic': return hood.civic.avgResDays<=3?'#38a169':hood.civic.avgResDays<=4.5?'#d69e2e':'#e53e3e';
    default: return hood.color;
  }
}
function getLayerOpacity(hood, layer) {
  switch(layer) {
    case 'vitality': return .15+(hood.business.footTraffic/100)*.35;
    case 'safety': return .15+(1-hood.safety.crimeRate/60)*.35;
    case 'spaces': { const a=hood.spaces.list.reduce((s,x)=>s+x.util,0)/(hood.spaces.list.length||1); return .15+(a/100)*.35; }
    case 'development': return .15+(hood.development.permits/30)*.35;
    case 'civic': return .15+(1-hood.civic.avgResDays/6)*.35;
    default: return .25;
  }
}

/* ═══════════════════════════════════════════════════
   RENDER
   ═══════════════════════════════════════════════════ */
function renderNeighborhoods() {
  circles.forEach(c=>map.removeLayer(c)); circles=[];
  NEIGHBORHOODS.forEach(hood=>{
    const color=getLayerColor(hood,activeLayer), opacity=getLayerOpacity(hood,activeLayer);
    const c=L.circle(hood.center,{radius:hood.radius,color,weight:activeHood===hood.id?3:1.5,fillColor:color,fillOpacity:activeHood===hood.id?opacity+.15:opacity}).addTo(map);
    c.bindTooltip(hood.name,{permanent:false,direction:'top'});
    c.on('click',()=>selectNeighborhood(hood.id));
    circles.push(c);
  });
}
function renderSidebar() {
  document.getElementById('hoodList').innerHTML=NEIGHBORHOODS.map(h=>`<li class="hood-item ${activeHood===h.id?'active':''}" role="option" aria-selected="${activeHood===h.id}" tabindex="0" onclick="selectNeighborhood('${h.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectNeighborhood('${h.id}')}"><span class="hood-dot" style="background:${getLayerColor(h,activeLayer)}" aria-hidden="true"></span>${h.name}</li>`).join('');
}
function renderLegendContent() {
  const legends={vitality:[['#38a169','Growth 8%+'],['#d69e2e','Growth 5-8%'],['#e53e3e','Growth < 5%']],safety:[['#38a169','Low Crime (< 20)'],['#d69e2e','Moderate (20-35)'],['#e53e3e','Elevated (35+)']],spaces:[['#38a169','Well-Utilized (65%+)'],['#d69e2e','Moderate (45-65%)'],['#e53e3e','Under-Utilized']],development:[['#dd6b20','Active (15+ permits)'],['#d69e2e','Moderate (8-15)'],['#718096','Low Activity']],civic:[['#38a169','Fast (< 3 days)'],['#d69e2e','Average (3-4.5d)'],['#e53e3e','Slow (4.5d+)']]};
  const rows=legends[activeLayer]||[];
  document.getElementById('legendTitle').textContent=LAYER_NAMES[activeLayer]+' Legend';
  document.getElementById('legendContent').innerHTML=rows.map(([c,l])=>`<div class="legend-row"><span class="legend-color" style="background:${c}"></span>${l}</div>`).join('');
}
function updateStatebar() {
  document.getElementById('stateLayer').textContent=LAYER_NAMES[activeLayer]||activeLayer;
  const hood=NEIGHBORHOODS.find(h=>h.id===activeHood);
  document.getElementById('stateHood').innerHTML=hood?`<strong style="color:#94a3b8">${hood.name}</strong>`:'<span style="color:#475569">No neighborhood selected</span>';
  document.getElementById('stateDot').style.background=hood?getLayerColor(hood,activeLayer):'#64748b';
}

/* ═══════════════════════════════════════════════════
   LAYER SWITCHING
   ═══════════════════════════════════════════════════ */
function setLayer(layer) {
  activeLayer=layer;
  activeQuestion=null;
  document.querySelectorAll('[data-layer]').forEach(b=>{b.classList.toggle('active',b.dataset.layer===layer);b.setAttribute('aria-pressed',b.dataset.layer===layer)});
  renderNeighborhoods(); renderSidebar(); renderLegendContent(); updateStatebar();
  if(activeHood){const hood=NEIGHBORHOODS.find(h=>h.id===activeHood); if(hood) openPanel(hood);}
  const desc={vitality:'Business Vitality — new openings vs. closures by neighborhood.',safety:'Safety Profile — actual crime rates vs. public perception.',spaces:'Parks & Trails — utilization rates across the city.',development:'Development — active construction permits and projects.',civic:'311 Civic — city response times to service requests.'};
  if(desc[layer]) showInsights('Viewing: '+desc[layer]);
}

/* ═══════════════════════════════════════════════════
   SELECT NEIGHBORHOOD
   ═══════════════════════════════════════════════════ */
function selectNeighborhood(id) {
  activeHood=id;
  const hood=NEIGHBORHOODS.find(h=>h.id===id);
  if(!hood) return;
  renderNeighborhoods(); renderSidebar(); updateStatebar();
  openPanel(hood);
  map.flyTo(hood.center,14,{duration:.5});
}

/* ═══════════════════════════════════════════════════
   DETAIL PANEL — 3 TABS
   ═══════════════════════════════════════════════════ */
function openPanel(hood) {
  const panel=document.getElementById('detailPanel'); panel.classList.add('open');
  panel.setAttribute('aria-hidden','false');
  Object.values(charts).forEach(c=>c.destroy()); charts={};
  document.getElementById('detailHeader').innerHTML=`
    <h2>${hood.name}</h2>
    <div class="detail-subtitle">${hood.description}</div>
    <button class="btn-compare-add" onclick="addToComparison('${hood.id}')" aria-label="Add ${hood.name} to comparison">+ Compare</button>`;
  const tabs=['Then','Now','Tomorrow'];
  const tabIds=['tabpanel-then','tabpanel-now','tabpanel-tomorrow'];
  document.getElementById('tabBar').innerHTML=tabs.map((t,i)=>`<button class="tab ${i===0?'active':''}" role="tab" aria-selected="${i===0}" aria-controls="${tabIds[i]}" tabindex="${i===0?'0':'-1'}" onclick="switchTab(${i},'${hood.id}')">${t}</button>`).join('');
  renderTabContent(hood);
  document.getElementById('poiBar').className='poi-toggle-bar panel-open';
  document.getElementById('comparisonBar').classList.add('panel-open');
  document.getElementById('comparisonBar').classList.remove('panel-closed');
  hideInsights();
  // On mobile, close sidebar when panel opens
  if(isMobileView()&&sidebarOpen){toggleSidebar()}
}
function switchTab(idx,hoodId) {
  document.querySelectorAll('.tab').forEach((t,i)=>{
    t.classList.toggle('active',i===idx);
    t.setAttribute('aria-selected',i===idx);
    t.setAttribute('tabindex',i===idx?'0':'-1');
  });
  document.querySelectorAll('.tab-content').forEach((c,i)=>{
    c.classList.toggle('active',i===idx);
    c.setAttribute('aria-hidden',i!==idx);
  });
  const hood=NEIGHBORHOODS.find(h=>h.id===hoodId);
  if(idx===1&&hood) setTimeout(()=>renderSafetyChart(hood),50);
}
function renderTabContent(hood) {
  // Load any user-submitted stories from localStorage
  const storedStories = JSON.parse(localStorage.getItem('stories_'+hood.id) || '[]');
  const allStories = [...(hood.communityStories||[]), ...storedStories];
  
  // Load wish votes from localStorage
  const storedVotes = JSON.parse(localStorage.getItem('votes_'+hood.id) || '{}');
  const votedWishes = JSON.parse(localStorage.getItem('voted_'+hood.id) || '[]');
  const storedWishes = JSON.parse(localStorage.getItem('wishes_'+hood.id) || '[]');
  const allWishes = [...(hood.wishes||[]).map(w=>({...w, votes: w.votes + (storedVotes[w.id]||0)})), ...storedWishes];
  allWishes.sort((a,b)=>b.votes-a.votes);
  
  const participationCount = allStories.length + allWishes.length;
  
  document.getElementById('tabContent').innerHTML=`
    <!-- THEN -->
    <div class="tab-content active" id="tabpanel-then" role="tabpanel" aria-label="Then — History" aria-hidden="false">
      <h3 style="font-family:'Playfair Display',serif;font-size:19px;color:#fff;margin-bottom:8px">${hood.history.title}</h3>
      <p class="neighborhood-narrative">${hood.history.text}</p>
      <div class="section-head">Key Historic Sites</div>
      ${hood.history.landmarks.map(l=>`<div class="landmark"><div class="landmark-icon">${l.icon}</div><div><div class="landmark-name">${l.name}</div><div class="landmark-desc">${l.desc}</div></div></div>`).join('')}
      ${hood.eras && hood.eras.length ? `
        <div class="section-head" style="margin-top:16px">Civil Rights & Historical Timeline</div>
        <div class="era-timeline">
          ${hood.eras.map(e=>`<div class="era-badge"><span class="era-badge-year">${e.year}</span><div><strong style="color:#e2e8f0;font-size:12px">${e.title}</strong><div style="margin-top:2px">${e.connection}</div></div></div>`).join('')}
        </div>
      ` : ''}
    </div>
    <!-- NOW -->
    <div class="tab-content" id="tabpanel-now" role="tabpanel" aria-label="Now — Present day" aria-hidden="true">
      <p class="neighborhood-narrative">${hood.narrative || hood.description}</p>
      ${hood.voices && hood.voices.length ? `
        <div class="section-head">What Residents Say</div>
        ${hood.voices.map(v=>`<div class="voice-card"><blockquote>&ldquo;${v.quote}&rdquo;</blockquote><cite>&mdash; ${v.author}, ${v.role}</cite></div>`).join('')}
      ` : ''}
      <button class="data-toggle" onclick="toggleDataSection(this)">
        <span class="toggle-arrow">&#9654;</span> By the Numbers
      </button>
      <div class="data-collapsible">
        <div class="stat-grid" style="margin-top:12px">
          <div class="stat-card"><div class="stat-label">Businesses</div><div class="stat-value">${hood.business.total}</div><div class="stat-change positive">+${hood.business.newOpen} new</div></div>
          <div class="stat-card"><div class="stat-label">Crime Rate</div><div class="stat-value">${hood.safety.crimeRate}<small style="font-size:11px;color:#64748b">/1k</small></div><div class="stat-change ${hood.safety.crimeChange<0?'positive':'negative'}">${hood.safety.crimeChange}% YoY</div></div>
          <div class="stat-card"><div class="stat-label">311 Response</div><div class="stat-value">${hood.civic.avgResDays}d</div><div class="stat-change">Grade: ${hood.civic.grade}</div></div>
          <div class="stat-card"><div class="stat-label">Permits</div><div class="stat-value">${hood.development.permits}</div><div class="stat-change positive">${hood.development.projects.length} projects</div></div>
        </div>
        <div class="insight-box"><strong>Bright Data Insight</strong>${hood.business.insight}</div>
        <div class="section-head" style="margin-top:16px">Safety: Perception vs. Reality</div>
        <div class="gap-bar-container">
          <div class="gap-row"><span class="gap-label">Actual</span><div class="gap-track"><div class="gap-fill reality" style="width:${hood.safety.crimeRate}%">${hood.safety.crimeRate}</div></div></div>
          <div class="gap-row"><span class="gap-label">Perception</span><div class="gap-track"><div class="gap-fill perception" style="width:${hood.safety.perception}%">${hood.safety.perception}</div></div></div>
          <div class="gap-row"><span class="gap-label">Media</span><div class="gap-track"><div class="gap-fill media" style="width:${hood.safety.mediaIndex}%">${hood.safety.mediaIndex}</div></div></div>
        </div>
        <div class="insight-box"><strong>Bright Data Insight</strong>${hood.safety.insight}</div>
        <div class="chart-container"><h4>Crime vs. Perception</h4><canvas id="chartSafety" height="180"></canvas></div>
      </div>
      <div class="section-head" style="margin-top:16px">Parks & Spaces</div>
      ${hood.spaces.list.map(s=>`<div class="space-item"><div><div class="space-name">${s.name}</div><div class="space-type">${s.type}</div></div><div style="text-align:right"><div style="font-size:11px;color:#64748b;margin-bottom:3px">${s.util}%</div><div class="utilization-bar"><div class="utilization-fill" style="width:${s.util}%;background:${s.util>=65?'#38a169':s.util>=45?'#d69e2e':'#e53e3e'}"></div></div></div></div>`).join('')}
      <div class="section-head" style="margin-top:16px">Restaurants (via Bright Data / Yelp)</div>
      ${hood.restaurants.map(r=>`<div class="restaurant-card"><div class="restaurant-name">${r.name}</div><div class="restaurant-meta"><span class="restaurant-rating">${r.rating} &#9733;</span><span>${r.cuisine}</span><span>${r.price}</span></div><div class="restaurant-note">${r.note}</div></div>`).join('')}
      <div class="section-head" style="margin-top:16px">Parking</div>
      ${hood.parking.map(p=>`<div class="parking-card"><div><div class="parking-name">${p.name}</div><div style="font-size:10px;color:#64748b">${p.type}</div></div><div class="parking-info"><div>${p.spots} spots</div><div>${p.rate}</div></div></div>`).join('')}
    </div>
    <!-- TOMORROW -->
    <div class="tab-content" id="tabpanel-tomorrow" role="tabpanel" aria-label="Tomorrow — Community voice" aria-hidden="true">
      <p class="tomorrow-intro">Montgomery's story isn't finished. Every neighborhood has a future shaped by the people who live, work, and care about it. This is your space to contribute.</p>
      <div class="participation-counter">&#127793; <strong>${participationCount}</strong>&nbsp;neighbors have shared their voice about ${hood.name}</div>
      
      <div class="section-head">Share Your Story</div>
      <div class="story-form" id="storyForm_${hood.id}">
        <button class="story-form-trigger" onclick="toggleStoryForm('${hood.id}')">&#128221; What does ${hood.name} mean to you?</button>
        <div class="story-form-fields" id="storyFields_${hood.id}">
          <label>Your relationship to this neighborhood</label>
          <select id="storyRole_${hood.id}">
            <option value="Resident">I live here</option>
            <option value="Worker">I work here</option>
            <option value="Visitor">I visit often</option>
            <option value="Business Owner">I own a business here</option>
            <option value="Former Resident">I used to live here</option>
          </select>
          <label>Your story</label>
          <textarea id="storyText_${hood.id}" placeholder="Share a memory, an observation, or what this place means to you..." maxlength="500"></textarea>
          <label>Your first name (optional)</label>
          <input type="text" id="storyName_${hood.id}" placeholder="Anonymous" maxlength="30">
          <button class="story-form-submit" onclick="submitStory('${hood.id}')">Share Your Story</button>
        </div>
      </div>
      
      ${allStories.length ? `
        <div class="section-head" style="margin-top:14px">Community Stories</div>
        ${allStories.map(s=>`<div class="submitted-story"><p>&ldquo;${s.quote}&rdquo;</p><cite>&mdash; ${s.author}, ${s.role}</cite></div>`).join('')}
      ` : ''}
      
      <div class="section-head" style="margin-top:18px">What Should Change in ${hood.name}?</div>
      ${allWishes.map(w=>`<div class="wish-card"><button class="wish-vote-btn ${votedWishes.includes(w.id)?'voted':''}" onclick="voteWish('${hood.id}',${w.id})">&#128077; ${w.votes}</button><span class="wish-text">${w.text}</span></div>`).join('')}
      <button class="story-form-trigger" style="margin-top:10px" onclick="toggleWishForm('${hood.id}')">+ Suggest something for ${hood.name}</button>
      <div class="story-form-fields" id="wishFields_${hood.id}">
        <label>Your suggestion</label>
        <input type="text" id="wishText_${hood.id}" placeholder="What would make this neighborhood better?" maxlength="100">
        <button class="story-form-submit" onclick="submitWish('${hood.id}')">Submit Suggestion</button>
      </div>
      
      <div class="section-head" style="margin-top:18px">Development Projects</div>
      ${hood.development.projects.map(p=>`<div style="font-size:12px;color:#94a3b8;padding:4px 0">&#9656; ${p}</div>`).join('')}
      <div class="section-head" style="margin-top:16px">Top 311 Issues</div>
      ${hood.civic.topIssues.map(i=>`<div style="font-size:12px;color:#94a3b8;padding:3px 0">&#8226; ${i}</div>`).join('')}
    </div>`;
}

function renderSafetyChart(hood) {
  if(charts.safety) charts.safety.destroy();
  const ctx=document.getElementById('chartSafety'); if(!ctx) return;
  charts.safety=new Chart(ctx,{type:'radar',data:{labels:['Crime Rate','Perception','Media','YoY Change','Safety Trend'],datasets:[{label:'Actual',data:[hood.safety.crimeRate,hood.safety.crimeRate*.9,hood.safety.crimeRate*.8,Math.abs(hood.safety.crimeChange)*2,(100-hood.safety.crimeRate)],borderColor:'#38a169',backgroundColor:'rgba(56,161,105,0.1)',pointBackgroundColor:'#38a169'},{label:'Perceived',data:[hood.safety.perception,hood.safety.perception,hood.safety.mediaIndex,hood.safety.mediaIndex*.6,(100-hood.safety.perception)],borderColor:'#e53e3e',backgroundColor:'rgba(229,62,62,0.1)',pointBackgroundColor:'#e53e3e'}]},options:{responsive:true,plugins:{legend:{labels:{color:'#94a3b8',font:{size:10}}}},scales:{r:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.06)'},pointLabels:{color:'#64748b',font:{size:9}},ticks:{display:false}}}}});
}
function closePanel() {
  const panel=document.getElementById('detailPanel');
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden','true');
  activeHood=null; renderNeighborhoods(); renderSidebar(); updateStatebar();
  map.flyTo([32.375,-86.295],13,{duration:.5});
  document.getElementById('poiBar').className='poi-toggle-bar panel-closed';
  document.getElementById('comparisonBar').classList.remove('panel-open');
  document.getElementById('comparisonBar').classList.add('panel-closed');
}

/* ═══════════════════════════════════════════════════
   STORY
   ═══════════════════════════════════════════════════ */
function toggleStory(){
  const overlay=document.getElementById('storyOverlay');
  overlay.classList.toggle('open');
  const isOpen=overlay.classList.contains('open');
  overlay.setAttribute('aria-hidden',!isOpen);
  if(isOpen){const closeBtn=overlay.querySelector('.btn-close');if(closeBtn)closeBtn.focus()}
}
function openStoryFromHero(){
  const hero=document.getElementById('heroOverlay');
  hero.classList.add('hiding');
  setTimeout(()=>{hero.remove();toggleStory()},500);
}
function viewOnMap(lat,lng,name){
  document.getElementById('storyOverlay').classList.remove('open');
  setTimeout(()=>{map.flyTo([lat,lng],16,{duration:.6});poiLayers.landmarks.eachLayer(m=>{if(m.getPopup&&m.getPopup()&&m.getPopup().getContent().indexOf(name)!==-1)setTimeout(()=>m.openPopup(),700)})},300);
}

/* ═══════════════════════════════════════════════════
   POI MARKERS
   ═══════════════════════════════════════════════════ */
const poiLayers={landmarks:L.layerGroup(),parks:L.layerGroup(),trails:L.layerGroup(),parking:L.layerGroup(),restaurants:L.layerGroup()};
const poiState={landmarks:true,parks:true,trails:true,parking:false,restaurants:false};
function createMarkerIcon(type){
  const c={landmarks:{css:'marker-landmark',icon:'&#9733;',size:[26,26]},parks:{css:'marker-park',icon:'&#127795;',size:[24,24]},trails:{css:'marker-trail',icon:'&#128694;',size:[22,22]},parking:{css:'marker-parking',icon:'&#127359;',size:[22,22]},restaurants:{css:'marker-restaurant',icon:'&#127860;',size:[22,22]}}[type];
  return L.divIcon({className:'',html:`<div class="marker-icon ${c.css}">${c.icon}</div>`,iconSize:c.size,iconAnchor:[c.size[0]/2,c.size[1]/2],popupAnchor:[0,-c.size[1]/2-4]});
}
function buildPOIMarkers(){
  POI_DATA.landmarks.forEach(p=>{const m=L.marker(p.coords,{icon:createMarkerIcon('landmarks')});m.bindPopup(`<div class="marker-popup"><h4>${p.name}</h4><div class="popup-type">Landmark</div><p>${p.desc}</p></div>`,{maxWidth:240});poiLayers.landmarks.addLayer(m)});
  POI_DATA.parks.forEach(p=>{const m=L.marker(p.coords,{icon:createMarkerIcon('parks')});m.bindPopup(`<div class="marker-popup"><h4>${p.name}</h4><div class="popup-type">Park &bull; ${p.acres} acres</div><p>${p.desc}</p></div>`,{maxWidth:240});poiLayers.parks.addLayer(m)});
  POI_DATA.trails.forEach(p=>{const m=L.marker(p.coords,{icon:createMarkerIcon('trails')});m.bindPopup(`<div class="marker-popup"><h4>${p.name}</h4><div class="popup-type">Trail &bull; ${p.miles}mi &bull; ${p.surface}</div><p>${p.desc}</p></div>`,{maxWidth:240});poiLayers.trails.addLayer(m)});
  POI_DATA.parking.forEach(p=>{const m=L.marker(p.coords,{icon:createMarkerIcon('parking')});m.bindPopup(`<div class="marker-popup"><h4>${p.name}</h4><div class="popup-type">Parking &bull; ${p.spots} spots &bull; ${p.rate}</div><p>${p.desc}</p></div>`,{maxWidth:240});poiLayers.parking.addLayer(m)});
  POI_DATA.restaurants.forEach(p=>{const m=L.marker(p.coords,{icon:createMarkerIcon('restaurants')});m.bindPopup(`<div class="marker-popup"><h4>${p.name}</h4><div class="popup-type">${p.cuisine} &bull; ${p.price}</div><p><span class="popup-rating">${p.rating} &#9733;</span> on Yelp (via Bright Data)</p></div>`,{maxWidth:240});poiLayers.restaurants.addLayer(m)});
  Object.keys(poiState).forEach(k=>{if(poiState[k])poiLayers[k].addTo(map)});
}
function togglePOI(type){
  poiState[type]=!poiState[type];
  const btn=document.querySelector(`.poi-btn[data-poi="${type}"]`);
  if(poiState[type]){poiLayers[type].addTo(map);btn.classList.add('active')}
  else{map.removeLayer(poiLayers[type]);btn.classList.remove('active')}
  btn.setAttribute('aria-pressed',poiState[type]);
}

/* ═══════════════════════════════════════════════════
   SEARCH
   ═══════════════════════════════════════════════════ */
const QUESTION_LABELS={business:'Where are new businesses opening?',perception:'Which areas are safer than people think?',parks:'Where are parks and trails?',investment:'Which areas are ripe for investment?',responsive:'How responsive is the city?'};
const QUESTIONS={
  business:{layer:'vitality',sort:(a,b)=>b.business.netGrowth-a.business.netGrowth,insight:'Showing neighborhoods where new business licenses and Yelp review activity are growing fastest.',count:3},
  perception:{layer:'safety',sort:(a,b)=>(b.safety.perception-b.safety.crimeRate)-(a.safety.perception-a.safety.crimeRate),insight:'These neighborhoods have significantly lower crime than public perception suggests.',count:3},
  parks:{layer:'spaces',sort:(a,b)=>{const aa=a.spaces.list.reduce((s,x)=>s+x.util,0)/(a.spaces.list.length||1),bb=b.spaces.list.reduce((s,x)=>s+x.util,0)/(b.spaces.list.length||1);return bb-aa},insight:'Highlighting neighborhoods with the most accessible and active public spaces.',count:3},
  investment:{layer:'development',sort:(a,b)=>b.development.permits-a.development.permits,insight:'These areas have the most active construction permits — signs of growth momentum.',count:3},
  responsive:{layer:'civic',sort:(a,b)=>a.civic.avgResDays-b.civic.avgResDays,insight:'Showing 311 responsiveness. Greener areas = faster city response.',count:3}
};

function initQuestionDropdown(){
  document.addEventListener('click',e=>{
    if(!e.target.closest('#questionWrap')){
      document.getElementById('questionDropdown').classList.remove('visible');
      document.getElementById('questionTrigger').classList.remove('active');
    }
  });
}
function toggleQuestionDropdown(){
  const dd=document.getElementById('questionDropdown'),btn=document.getElementById('questionTrigger');
  const isOpen=dd.classList.contains('visible');
  if(isOpen){dd.classList.remove('visible');btn.classList.remove('active');btn.setAttribute('aria-expanded','false');return}
  dd.innerHTML='<div class="question-section-label" role="presentation">Ask Montgomery</div>'+Object.entries(QUESTION_LABELS).map(([k,l])=>`<button class="question-result" role="option" onclick="selectQuestionFromDropdown('${k}')" aria-label="${l}"><span class="question-result-icon" aria-hidden="true">&#10067;</span><span>${l}</span></button>`).join('');
  dd.classList.add('visible');
  btn.classList.add('active');
  btn.setAttribute('aria-expanded','true');
}
function selectQuestionFromDropdown(key){
  document.getElementById('questionDropdown').classList.remove('visible');
  document.getElementById('questionTrigger').classList.remove('active');
  selectQuestion(key);
}
function selectQuestion(qKey){
  if(activeQuestion===qKey){activeQuestion=null;hideInsights();return}
  activeQuestion=qKey; const q=QUESTIONS[qKey];
  setLayer(q.layer); showInsights(q.insight);
  const sorted=NEIGHBORHOODS.slice().sort(q.sort);
  const bounds=L.latLngBounds(sorted.slice(0,q.count).map(h=>h.center));
  map.flyToBounds(bounds.pad(.3),{duration:.6});
}

/* ═══════════════════════════════════════════════════
   INSIGHTS
   ═══════════════════════════════════════════════════ */
function showInsights(text){document.getElementById('insightsText').textContent=text;document.getElementById('insightsPanel').classList.add('visible')}
function hideInsights(){document.getElementById('insightsPanel').classList.remove('visible')}

/* ═══════════════════════════════════════════════════
   COMPARE
   ═══════════════════════════════════════════════════ */
function addToComparison(id){
  if(comparisonHoods.has(id))return;
  if(comparisonHoods.size>=3){const first=[...comparisonHoods][0];comparisonHoods.delete(first)}
  comparisonHoods.add(id); renderComparison();
}
function removeFromComparison(id){comparisonHoods.delete(id);renderComparison()}
function clearComparison(){comparisonHoods.clear();renderComparison()}
function renderComparison(){
  const bar=document.getElementById('comparisonBar'),container=document.getElementById('comparisonHoods');
  if(!comparisonHoods.size){bar.classList.remove('visible');return}
  bar.classList.add('visible');
  container.innerHTML=[...comparisonHoods].map(id=>{const h=NEIGHBORHOODS.find(n=>n.id===id);return`<div class="comparison-card" role="group" aria-label="${h.name} comparison"><button class="btn-compare-remove" onclick="removeFromComparison('${id}')" aria-label="Remove ${h.name} from comparison">&times;</button><div class="comparison-card-name">${h.name}</div><div class="comparison-stat"><span>Growth</span><strong style="color:${h.business.netGrowth>=8?'#68d391':'#d69e2e'}">${h.business.netGrowth}%</strong></div><div class="comparison-stat"><span>Crime</span><strong>${h.safety.crimeRate}</strong></div><div class="comparison-stat"><span>311</span><strong>${h.civic.avgResDays}d</strong></div><div class="comparison-stat"><span>Permits</span><strong>${h.development.permits}</strong></div></div>`}).join('');
}

/* ═══════════════════════════════════════════════════
   SIDEBAR COLLAPSE / EXPAND (responsive-aware)
   ═══════════════════════════════════════════════════ */
let sidebarOpen=true;
function isMobileView(){return window.innerWidth<1024}
function toggleSidebar(){
  sidebarOpen=!sidebarOpen;
  const sb=document.querySelector('.sidebar'),btn=document.getElementById('sidebarCollapseBtn'),stateBar=document.querySelector('.state-bar'),poiBar=document.getElementById('poiBar'),legendP=document.getElementById('legendPopup'),navBanner=document.getElementById('navBanner');
  if(isMobileView()){
    sb.classList.toggle('visible-mobile',sidebarOpen);
    btn.classList.toggle('sidebar-open-mobile',sidebarOpen);
    stateBar.classList.toggle('sidebar-visible-mobile',sidebarOpen);
    poiBar.classList.toggle('sidebar-visible-mobile',sidebarOpen);
    if(navBanner)navBanner.classList.toggle('sidebar-visible-mobile',sidebarOpen);
  } else {
    sb.classList.toggle('hidden',!sidebarOpen);
    btn.classList.toggle('shifted',!sidebarOpen);
    stateBar.classList.toggle('sidebar-hidden',!sidebarOpen);
    poiBar.classList.toggle('sidebar-hidden',!sidebarOpen);
    if(navBanner)navBanner.classList.toggle('sidebar-hidden',!sidebarOpen);
  }
  btn.innerHTML=sidebarOpen?'◀':'▶';
  btn.setAttribute('aria-expanded',sidebarOpen);
  if(legendP)legendP.classList.remove('visible');
  setTimeout(()=>map.invalidateSize(),350);
}
function initResponsive(){
  if(isMobileView()){
    sidebarOpen=false;
    const sb=document.querySelector('.sidebar'),btn=document.getElementById('sidebarCollapseBtn');
    sb.classList.remove('visible-mobile');
    btn.classList.remove('sidebar-open-mobile');
    btn.innerHTML='▶';
    btn.setAttribute('aria-expanded','false');
  }
  window.addEventListener('resize',function(){
    const sb=document.querySelector('.sidebar'),btn=document.getElementById('sidebarCollapseBtn'),stateBar=document.querySelector('.state-bar'),poiBar=document.getElementById('poiBar'),navBanner=document.getElementById('navBanner');
    // Clean up classes from other mode
    sb.classList.remove('hidden','visible-mobile');
    btn.classList.remove('shifted','sidebar-open-mobile');
    stateBar.classList.remove('sidebar-hidden','sidebar-visible-mobile');
    poiBar.classList.remove('sidebar-hidden','sidebar-visible-mobile');
    if(navBanner){navBanner.classList.remove('sidebar-hidden','sidebar-visible-mobile')}
    if(isMobileView()){
      sidebarOpen=false;
      btn.innerHTML='▶';
    } else {
      sidebarOpen=true;
      btn.innerHTML='◀';
    }
    setTimeout(()=>map.invalidateSize(),350);
  });
}

/* ═══════════════════════════════════════════════════
   SIDEBAR SECTION TOGGLE
   ═══════════════════════════════════════════════════ */
function toggleSidebarSection(section){
  const btn=event.target.closest('.sidebar-toggle'),content=document.getElementById(section+'-content');
  btn.classList.toggle('collapsed'); content.classList.toggle('collapsed');
  const isExpanded=!btn.classList.contains('collapsed');
  btn.setAttribute('aria-expanded',isExpanded);
}

/* ═══════════════════════════════════════════════════
   LEGEND / ABOUT / MAP INFO
   ═══════════════════════════════════════════════════ */
function toggleLegend(){renderLegendContent();document.getElementById('legendPopup').classList.toggle('visible')}
function toggleAbout(){
  const modal=document.getElementById('aboutModal');
  modal.classList.toggle('visible');
  const isOpen=modal.classList.contains('visible');
  if(isOpen){const closeBtn=modal.querySelector('.btn-close');if(closeBtn)closeBtn.focus()}
}
function toggleMapInfo(){
  const card=document.getElementById('mapInfoCard');
  card.classList.toggle('visible');
  document.getElementById('mapInfoBtn').setAttribute('aria-expanded',card.classList.contains('visible'));
}
document.addEventListener('click',e=>{
  if(!e.target.closest('#mapInfoBtn')&&!e.target.closest('#mapInfoCard'))document.getElementById('mapInfoCard').classList.remove('visible');
  if(!e.target.closest('.legend-popup')&&!e.target.closest('.sidebar-links'))document.getElementById('legendPopup').classList.remove('visible');
});

/* ═══════════════════════════════════════════════════
   INTENT SYSTEM
   ═══════════════════════════════════════════════════ */
const INTENTS={
  exploring:{layer:'vitality',neighborhood:'downtown',pois:['landmarks','parks','trails']},
  visiting:{layer:'vitality',neighborhood:'downtown',pois:['landmarks','parks','trails','restaurants']},
  investing:{layer:'development',neighborhood:null,pois:['landmarks']},
  resident:{layer:'safety',neighborhood:null,pois:['landmarks','parks']}
};
function selectIntent(intent){
  const cfg=INTENTS[intent];
  // Set layer
  setLayer(cfg.layer);
  // Configure POIs
  Object.keys(poiState).forEach(poi=>{
    const shouldBeOn=cfg.pois.includes(poi);
    if(shouldBeOn!==poiState[poi]) togglePOI(poi);
  });
  // Select neighborhood
  let hoodId=cfg.neighborhood;
  if(!hoodId){
    if(intent==='investing') hoodId=NEIGHBORHOODS.slice().sort((a,b)=>b.business.netGrowth-a.business.netGrowth)[0].id;
    else if(intent==='resident') hoodId=NEIGHBORHOODS.slice().sort((a,b)=>(b.safety.perception-b.safety.crimeRate)-(a.safety.perception-a.safety.crimeRate))[0].id;
    else hoodId='downtown';
  }
  selectNeighborhood(hoodId);
  // Fade hero
  const hero=document.getElementById('heroOverlay');
  hero.classList.add('hiding');
  setTimeout(()=>hero.remove(),500);
  // Show navigation banner
  setTimeout(()=>{
    document.getElementById('navBanner').classList.add('visible');
  },600);
}
function dismissNavBanner(){document.getElementById('navBanner').classList.remove('visible')}

/* ═══════════════════════════════════════════════════
   LOADING
   ═══════════════════════════════════════════════════ */
function hideLoading(){
  const ls=document.getElementById('loadingScreen');
  ls.classList.add('hide');
  setTimeout(()=>{ls.remove();document.getElementById('heroOverlay').classList.add('visible')},500);
}
/* ═══════════════════════════════════════════════════
   CIVIC PARTICIPATION — STORIES & WISHES
   ═══════════════════════════════════════════════════ */
function toggleStoryForm(hoodId){
  document.getElementById('storyFields_'+hoodId).classList.toggle('visible');
}
function toggleWishForm(hoodId){
  document.getElementById('wishFields_'+hoodId).classList.toggle('visible');
}
function toggleDataSection(btn){
  btn.classList.toggle('open');
  const collapsible=btn.nextElementSibling;
  collapsible.classList.toggle('open');
  if(collapsible.classList.contains('open')){
    const hood=NEIGHBORHOODS.find(h=>h.id===activeHood);
    if(hood) setTimeout(()=>renderSafetyChart(hood),100);
  }
}
function submitStory(hoodId){
  const text=document.getElementById('storyText_'+hoodId).value.trim();
  if(!text || text.length<10){showToast('Please write at least 10 characters.');return}
  const name=document.getElementById('storyName_'+hoodId).value.trim()||'Anonymous';
  const role=document.getElementById('storyRole_'+hoodId).value;
  const stories=JSON.parse(localStorage.getItem('stories_'+hoodId)||'[]');
  stories.push({author:name, role:role, quote:text});
  localStorage.setItem('stories_'+hoodId, JSON.stringify(stories));
  showToast('Thanks for sharing! Your story is now part of Montgomery\'s narrative.');
  const hood=NEIGHBORHOODS.find(h=>h.id===hoodId);
  if(hood) renderTabContent(hood);
  // Re-activate the Tomorrow tab
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',i===2));
  document.querySelectorAll('.tab-content').forEach((c,i)=>c.classList.toggle('active',i===2));
}
function voteWish(hoodId, wishId){
  const votedKey='voted_'+hoodId;
  const voted=JSON.parse(localStorage.getItem(votedKey)||'[]');
  if(voted.includes(wishId)){showToast('You\'ve already voted for this!');return}
  voted.push(wishId);
  localStorage.setItem(votedKey, JSON.stringify(voted));
  const votesKey='votes_'+hoodId;
  const votes=JSON.parse(localStorage.getItem(votesKey)||'{}');
  votes[wishId]=(votes[wishId]||0)+1;
  localStorage.setItem(votesKey, JSON.stringify(votes));
  const hood=NEIGHBORHOODS.find(h=>h.id===hoodId);
  if(hood) renderTabContent(hood);
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',i===2));
  document.querySelectorAll('.tab-content').forEach((c,i)=>c.classList.toggle('active',i===2));
}
function submitWish(hoodId){
  const text=document.getElementById('wishText_'+hoodId).value.trim();
  if(!text || text.length<5){showToast('Please write at least 5 characters.');return}
  const wishes=JSON.parse(localStorage.getItem('wishes_'+hoodId)||'[]');
  const newId=Date.now();
  wishes.push({id:newId, text:text, votes:1});
  localStorage.setItem('wishes_'+hoodId, JSON.stringify(wishes));
  // Auto-vote for your own suggestion
  const voted=JSON.parse(localStorage.getItem('voted_'+hoodId)||'[]');
  voted.push(newId);
  localStorage.setItem('voted_'+hoodId, JSON.stringify(voted));
  showToast('Suggestion added! Others can now vote for it.');
  const hood=NEIGHBORHOODS.find(h=>h.id===hoodId);
  if(hood) renderTabContent(hood);
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',i===2));
  document.querySelectorAll('.tab-content').forEach((c,i)=>c.classList.toggle('active',i===2));
}
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.classList.add('visible');
  setTimeout(()=>t.classList.remove('visible'),3000);
}


/* ═══════════════════════════════════════════════════
   KEYBOARD ACCESSIBILITY
   ═══════════════════════════════════════════════════ */
// Activate intent cards, hood items, and any [role="button"] via Enter/Space
document.addEventListener('keydown',function(e){
  const el=e.target;
  // Enter/Space on role="button" elements (intent cards, etc.)
  if((e.key==='Enter'||e.key===' ')&&el.getAttribute('role')==='button'){
    e.preventDefault();el.click();
  }
  // Arrow keys for tab navigation in detail panel
  if(el.getAttribute('role')==='tab'){
    const tabs=Array.from(el.parentNode.querySelectorAll('[role="tab"]'));
    let idx=tabs.indexOf(el);
    if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();idx=(idx+1)%tabs.length;tabs[idx].focus();tabs[idx].click()}
    if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();idx=(idx-1+tabs.length)%tabs.length;tabs[idx].focus();tabs[idx].click()}
  }
  // Escape key — close overlays and panels in order of priority
  if(e.key==='Escape'){
    const story=document.getElementById('storyOverlay');
    const about=document.getElementById('aboutModal');
    const detail=document.getElementById('detailPanel');
    const qd=document.getElementById('questionDropdown');
    if(story&&story.classList.contains('open')){toggleStory();return}
    if(about&&about.classList.contains('visible')){toggleAbout();return}
    if(qd&&qd.classList.contains('visible')){toggleQuestionDropdown();return}
    if(detail&&detail.classList.contains('open')){closePanel();return}
  }
});

/* ═══════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════ */
renderNeighborhoods();
renderSidebar();
renderLegendContent();
buildPOIMarkers();
updateStatebar();
initQuestionDropdown();
initResponsive();
// Collapse Data Layers by default
(function(){
  const layersToggle=document.querySelector('[onclick="toggleSidebarSection(\'layers\')"]');
  const layersContent=document.getElementById('layers-content');
  if(layersToggle){layersToggle.classList.add('collapsed');layersToggle.setAttribute('aria-expanded','false')}
  if(layersContent) layersContent.classList.add('collapsed');
})();
map.whenReady(()=>setTimeout(hideLoading,600));
