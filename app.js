// ===== 持ち物チェックリスト app.js =====
const STORAGE_KEY = 'packing-checklists-v1';

const uid = () => Math.random().toString(36).slice(2, 10);

/** state = { lists: [ {id,name,filter,items:[node,...]} ] , currentListId } */
let state = load() || { lists: [], currentListId: null };

function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ console.error('load failed', e); return null; }
}
function save(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch(e){ console.error('save failed', e); }
}

function newNode(name, note=''){
  return { id:uid(), name, note, checked:false, collapsed:false, children:[] };
}

function findList(id){ return state.lists.find(l => l.id===id); }

function findNode(nodes, id){
  for(const n of nodes){
    if(n.id===id) return n;
    const found = findNode(n.children, id);
    if(found) return found;
  }
  return null;
}
function findParentArray(nodes, id, parentArr=null){
  for(const n of nodes){
    if(n.id===id) return nodes;
    const r = findParentArray(n.children, id, n.children);
    if(r) return r;
  }
  return null;
}

function setCheckedRecursive(node, value){
  node.checked = value;
  node.children.forEach(c => setCheckedRecursive(c, value));
}

function countDirect(node){
  const total = node.children.length;
  const checked = node.children.filter(c=>c.checked).length;
  return { total, checked };
}

function countAll(nodes){
  let total=0, checked=0;
  nodes.forEach(n=>{
    total++; if(n.checked) checked++;
    const sub = countAll(n.children);
    total += sub.total; checked += sub.checked;
  });
  return { total, checked };
}

function nodeHasVisibleDescendant(node){
  if(!node.checked) return true;
  return node.children.some(nodeHasVisibleDescendant);
}

// ===== DOM refs =====
const viewLists = document.getElementById('view-lists');
const viewDetail = document.getElementById('view-detail');
const listsContainer = document.getElementById('lists-container');
const treeRoot = document.getElementById('tree-root');
const detailTitle = document.getElementById('detail-title');
const progressFill = document.getElementById('progress-fill');
const progressLabel = document.getElementById('progress-label');

// ===== 画面遷移 =====
function showLists(){
  state.currentListId = null;
  viewDetail.classList.add('hidden');
  viewLists.classList.remove('hidden');
  renderLists();
  save();
}
function showDetail(id){
  state.currentListId = id;
  viewLists.classList.add('hidden');
  viewDetail.classList.remove('hidden');
  renderDetail();
  save();
}

// ===== 一覧画面 描画 =====
function renderLists(){
  listsContainer.innerHTML = '';
  if(state.lists.length===0){
    listsContainer.innerHTML = '<div class="empty-hint">まだチェックリストがないよ。<br>「+ 新しいチェックリスト」から作ろう。</div>';
    return;
  }
  state.lists.forEach(list=>{
    const {total, checked} = countAll(list.items);
    const card = document.createElement('div');
    card.className = 'list-card';
    card.innerHTML = `
      <span class="lc-name"></span>
      <span class="lc-count mono">${checked}/${total}</span>
      <button class="lc-del" title="削除">🗑</button>
    `;
    card.querySelector('.lc-name').textContent = list.name;
    card.addEventListener('click', (e)=>{
      if(e.target.closest('.lc-del')) return;
      showDetail(list.id);
    });
    card.querySelector('.lc-del').addEventListener('click', (e)=>{
      e.stopPropagation();
      if(confirm(`「${list.name}」を削除する?`)){
        state.lists = state.lists.filter(l=>l.id!==list.id);
        save(); renderLists();
      }
    });
    listsContainer.appendChild(card);
  });
}

document.getElementById('btn-new-list').addEventListener('click', ()=>{
  const name = prompt('チェックリストの名前は?', '例: 旅行の持ち物');
  if(!name) return;
  const list = { id:uid(), name, filter:'all', items:[] };
  state.lists.push(list);
  save(); renderLists();
});

document.getElementById('btn-back').addEventListener('click', showLists);
document.getElementById('btn-rename').addEventListener('click', ()=>{
  const list = findList(state.currentListId);
  const name = prompt('新しい名前は?', list.name);
  if(!name) return;
  list.name = name;
  save(); renderDetail();
});

// ===== 詳細画面 描画 =====
function renderDetail(){
  const list = findList(state.currentListId);
  if(!list){ showLists(); return; }
  detailTitle.textContent = list.name;

  // フィルターボタンの見た目
  document.querySelectorAll('.filter-btn').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.filter === list.filter);
  });

  const {total, checked} = countAll(list.items);
  const pct = total===0 ? 0 : Math.round(checked/total*100);
  progressFill.style.width = pct + '%';
  progressLabel.textContent = `${checked}/${total}`;

  treeRoot.innerHTML = '';
  if(list.items.length===0){
    treeRoot.innerHTML = '<div class="empty-hint">まだ項目がないよ。下のボタンから追加しよう。</div>';
  }else{
    list.items.forEach(node=>{
      if(list.filter==='unchecked' && !nodeHasVisibleDescendant(node)) return;
      treeRoot.appendChild(renderNode(node, list, 0));
    });
  }
}

// ===== ドラッグ&ドロップで並び替え =====
let dragCtx = null;

function startDrag(e, wrap, list){
  e.preventDefault();
  const container = wrap.parentElement; // treeRoot もしくは .node-children
  wrap.setPointerCapture(e.pointerId);
  wrap.classList.add('dragging');
  dragCtx = { pointerId: e.pointerId };

  function onMove(ev){
    if(!dragCtx || ev.pointerId !== dragCtx.pointerId) return;
    const siblings = Array.from(container.children).filter(el => el.classList.contains('node') && el !== wrap);
    const y = ev.clientY;
    let target = null;
    for(const sib of siblings){
      const rect = sib.getBoundingClientRect();
      if(y < rect.top + rect.height/2){ target = sib; break; }
    }
    if(target) container.insertBefore(wrap, target);
    else container.appendChild(wrap);
  }

  function onUp(ev){
    if(!dragCtx || ev.pointerId !== dragCtx.pointerId) return;
    wrap.classList.remove('dragging');
    try{ wrap.releasePointerCapture(ev.pointerId); }catch(_){/* noop */}
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    dragCtx = null;

    // DOM上の新しい並び順をデータに反映する
    const arr = (container === treeRoot)
      ? list.items
      : findNode(list.items, container.dataset.parentId).children;
    const idsInOrder = Array.from(container.children)
      .filter(el => el.classList.contains('node'))
      .map(el => el.dataset.id);
    arr.sort((a,b) => idsInOrder.indexOf(a.id) - idsInOrder.indexOf(b.id));

    save();
    renderDetail();
  }

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

function renderNode(node, list, depth){
  const wrap = document.createElement('div');
  wrap.className = `node depth-${depth}`;
  wrap.dataset.id = node.id;

  const row = document.createElement('div');
  row.className = 'node-row' + (node.checked ? ' checked' : '');

  const hasChildren = node.children.length>0;

  row.innerHTML = `
    <button class="drag-handle" title="ドラッグで並び替え">⠿</button>
    ${hasChildren ? `<button class="node-toggle-collapse">${node.collapsed?'▶':'▼'}</button>` : '<span style="width:18px"></span>'}
    <input type="checkbox" class="node-checkbox" ${node.checked?'checked':''}>
    <span class="node-name">${escapeHtml(node.name)}</span>
    ${hasChildren ? `<span class="node-count mono"></span>` : ''}
    <div class="node-actions">
      <button class="act-add" title="子項目を追加">＋</button>
      <button class="act-del danger" title="削除">🗑</button>
    </div>
  `;

  if(hasChildren){
    const {total, checked} = countDirect(node);
    row.querySelector('.node-count').textContent = `${checked}/${total}`;
    row.querySelector('.node-toggle-collapse').addEventListener('click', ()=>{
      node.collapsed = !node.collapsed;
      save(); renderDetail();
    });
  }

  const handle = row.querySelector('.drag-handle');
  if(list.filter !== 'all'){
    handle.disabled = true;
    handle.classList.add('disabled');
  }else{
    handle.addEventListener('pointerdown', (e)=> startDrag(e, wrap, list));
  }

  row.querySelector('.node-checkbox').addEventListener('change', (e)=>{
    node.checked = e.target.checked;
    save(); renderDetail();
  });

  row.querySelector('.act-add').addEventListener('click', ()=>{
    const name = prompt('子項目の名前は?');
    if(!name) return;
    node.children.push(newNode(name));
    node.collapsed = false;
    save(); renderDetail();
  });

  row.querySelector('.act-del').addEventListener('click', ()=>{
    if(!confirm(`「${node.name}」を削除する?(子項目も全部消えるよ)`)) return;
    const arr = findParentArray(list.items, node.id) || list.items;
    const idx = arr.indexOf(node);
    if(idx>-1) arr.splice(idx,1);
    save(); renderDetail();
  });

  wrap.appendChild(row);

  // 全チェック/全解除(このノード配下すべて)
  const subrow = document.createElement('div');
  subrow.className = 'node-subrow';
  subrow.innerHTML = `
    <button class="mini-btn act-check-all">この階層を全部チェック</button>
    <button class="mini-btn act-uncheck-all">この階層を全部解除</button>
  `;
  subrow.querySelector('.act-check-all').addEventListener('click', ()=>{
    setCheckedRecursive(node, true);
    save(); renderDetail();
  });
  subrow.querySelector('.act-uncheck-all').addEventListener('click', ()=>{
    setCheckedRecursive(node, false);
    save(); renderDetail();
  });
  wrap.appendChild(subrow);

  if(hasChildren && !node.collapsed){
    const childWrap = document.createElement('div');
    childWrap.className = 'node-children';
    childWrap.dataset.parentId = node.id;
    node.children.forEach(child=>{
      if(list.filter==='unchecked' && !nodeHasVisibleDescendant(child)) return;
      childWrap.appendChild(renderNode(child, list, depth+1));
    });
    wrap.appendChild(childWrap);
  }

  return wrap;
}

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

document.getElementById('btn-add-root-item').addEventListener('click', ()=>{
  const list = findList(state.currentListId);
  const name = prompt('項目の名前は?');
  if(!name) return;
  list.items.push(newNode(name));
  save(); renderDetail();
});

document.querySelectorAll('.filter-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const list = findList(state.currentListId);
    list.filter = btn.dataset.filter;
    save(); renderDetail();
  });
});

// ===== 書き出し / 読み込み =====
document.getElementById('btn-export').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'packing-checklists.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('file-import').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const imported = JSON.parse(reader.result);
      if(!imported.lists) throw new Error('形式が違うよ');
      if(confirm('今のデータに追加する?(キャンセルで全部上書き)')){
        state.lists.push(...imported.lists);
      }else{
        state.lists = imported.lists;
      }
      save(); showLists();
    }catch(err){
      alert('読み込みに失敗したよ: ' + err.message);
    }
  };
  reader.readAsText(file);
});

// ===== Service Worker 登録 =====
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}

// ===== 初期表示 =====
showLists();
