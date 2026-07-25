// ===== 持ち物チェックリスト app.js =====
const STORAGE_KEY = 'packing-checklists-v1';
const LIST_COLORS = ['#FF9500','#007AFF','#34C759','#AF52DE','#FF3B30','#5AC8FA','#FFCC00','#FF2D55'];

const uid = () => Math.random().toString(36).slice(2, 10);

/** state = { lists: [ {id,name,color,filter,items:[node,...]} ] , currentListId } */
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

function newNode(name='', note=''){
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
function findParentArray(nodes, id){
  for(const n of nodes){
    if(n.id===id) return nodes;
    const r = findParentArray(n.children, id);
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

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
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
function showDetail(id, focusTitle=false){
  state.currentListId = id;
  viewLists.classList.add('hidden');
  viewDetail.classList.remove('hidden');
  renderDetail();
  save();
  if(focusTitle){
    detailTitle.focus();
    document.execCommand('selectAll', false, null);
  }
}

// ===== 一覧画面 描画 =====
function renderLists(){
  listsContainer.innerHTML = '';
  if(state.lists.length===0){
    listsContainer.classList.add('hidden');
    let hint = document.getElementById('lists-empty-hint');
    if(!hint){
      hint = document.createElement('div');
      hint.id = 'lists-empty-hint';
      hint.className = 'empty-hint';
      hint.textContent = 'まだリストがないよ。「＋ 新しいリスト」から作ろう。';
      listsContainer.parentNode.insertBefore(hint, listsContainer);
    }
    hint.classList.remove('hidden');
    return;
  }
  listsContainer.classList.remove('hidden');
  const hint = document.getElementById('lists-empty-hint');
  if(hint) hint.classList.add('hidden');

  state.lists.forEach((list, idx)=>{
    const {total, checked} = countAll(list.items);
    const color = list.color || LIST_COLORS[idx % LIST_COLORS.length];
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <span class="list-icon" style="background:${color}">✓</span>
      <span class="lr-name"></span>
      <span class="lr-count">${total>0 ? (total-checked) : ''}</span>
      <button class="lr-del" title="削除">🗑</button>
      <span class="lr-chevron">›</span>
    `;
    row.querySelector('.lr-name').textContent = list.name;
    row.addEventListener('click', (e)=>{
      if(e.target.closest('.lr-del')) return;
      showDetail(list.id);
    });
    row.querySelector('.lr-del').addEventListener('click', (e)=>{
      e.stopPropagation();
      if(confirm(`「${list.name}」を削除する?`)){
        state.lists = state.lists.filter(l=>l.id!==list.id);
        save(); renderLists();
      }
    });
    listsContainer.appendChild(row);
  });
}

// 編集中(キーボード表示中)に「追加」系ボタンをタップした場合、
// 1回目のタップはキーボードを閉じるだけにして、誤操作での追加を防ぐ
function guardAddClick(e){
  const active = document.activeElement;
  const isEditing = active && (active.classList && active.classList.contains('node-name') || active === detailTitle);
  if(isEditing){
    active.blur();
    e.preventDefault();
    e.stopPropagation();
  }
}
document.getElementById('btn-new-list').addEventListener('click', guardAddClick, true);
document.getElementById('btn-add-root-item').addEventListener('click', guardAddClick, true);

document.getElementById('btn-new-list').addEventListener('click', ()=>{
  const color = LIST_COLORS[state.lists.length % LIST_COLORS.length];
  const list = { id:uid(), name:'', color, filter:'all', items:[] };
  state.lists.push(list);
  save();
  showDetail(list.id, true); // 作成直後にタイトルへフォーカスして即入力できるようにする
});

document.getElementById('btn-back').addEventListener('click', showLists);

// タイトル(リスト名)のインライン編集
detailTitle.addEventListener('blur', ()=>{
  const list = findList(state.currentListId);
  if(!list) return;
  const val = detailTitle.textContent.trim();
  list.name = val || '無題のリスト';
  detailTitle.textContent = list.name;
  save();
  renderLists(); // 一覧側の名前も更新しておく
});
detailTitle.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){ e.preventDefault(); detailTitle.blur(); }
});

// ===== 詳細画面 描画 =====
function renderDetail(){
  const list = findList(state.currentListId);
  if(!list){ showLists(); return; }
  detailTitle.textContent = list.name;

  document.querySelectorAll('.seg-btn').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.filter === list.filter);
  });

  const {total, checked} = countAll(list.items);
  const pct = total===0 ? 0 : Math.round(checked/total*100);
  progressFill.style.width = pct + '%';
  progressLabel.textContent = `${checked}/${total}`;

  treeRoot.innerHTML = '';
  const visibleRoots = list.items.filter(n => list.filter!=='unchecked' || nodeHasVisibleDescendant(n));
  if(visibleRoots.length===0){
    treeRoot.innerHTML = `<div class="empty-hint">${list.items.length===0 ? 'まだ項目がないよ。下のボタンから追加しよう。' : '未チェックの項目はないよ。'}</div>`;
  }else{
    visibleRoots.forEach((node, i)=>{
      const el = renderNode(node, list, 0);
      if(i === visibleRoots.length-1) markLastInGroup(el);
      treeRoot.appendChild(el);
    });
  }
}

// カード内の最後の行だけ罫線を消すための印付け(区切り線を「グループ内だけ」に見せる)
function markLastInGroup(nodeEl){
  nodeEl.classList.add('last-in-group');
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
    ${hasChildren ? `<button class="node-toggle-collapse">${node.collapsed?'▶':'▼'}</button>` : '<span style="width:16px;flex-shrink:0"></span>'}
    <button class="check-circle${node.checked?' checked':''}" aria-label="チェック"></button>
    <span class="node-name" contenteditable="true" spellcheck="false" data-placeholder="新規項目"></span>
    ${hasChildren ? `<span class="node-count"></span>` : ''}
    <div class="node-actions">
      <button class="act-add" title="子項目を追加">＋</button>
      <button class="act-del danger" title="削除">🗑</button>
    </div>
  `;
  row.querySelector('.node-name').textContent = node.name;

  if(hasChildren){
    const {total, checked} = countDirect(node);
    row.querySelector('.node-count').textContent = `${checked}/${total}`;
    row.querySelector('.node-toggle-collapse').addEventListener('click', ()=>{
      node.collapsed = !node.collapsed;
      save(); renderDetail();
    });
  }

  // チェックの切り替え
  row.querySelector('.check-circle').addEventListener('click', ()=>{
    node.checked = !node.checked;
    save(); renderDetail();
  });

  // 項目名のインライン編集
  const nameEl = row.querySelector('.node-name');
  nameEl.addEventListener('blur', ()=>{
    const val = nameEl.textContent.trim();
    node.name = val || '無題の項目';
    nameEl.textContent = node.name;
    save();
  });
  nameEl.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){ e.preventDefault(); nameEl.blur(); }
  });

  // 子項目の追加(追加後すぐ名前を編集できるようにフォーカス)
  const addBtn = row.querySelector('.act-add');
  addBtn.addEventListener('click', guardAddClick, true);
  addBtn.addEventListener('click', ()=>{
    const child = newNode();
    node.children.push(child);
    node.collapsed = false;
    save(); renderDetail();
    focusNodeName(child.id);
  });

  row.querySelector('.act-del').addEventListener('click', ()=>{
    if(hasChildren && !confirm(`「${node.name}」を削除する?(子項目も全部消えるよ)`)) return;
    const arr = findParentArray(list.items, node.id) || list.items;
    const idx = arr.findIndex(n=>n.id===node.id);
    if(idx>-1) arr.splice(idx,1);
    save(); renderDetail();
  });

  // ドラッグハンドル(「未チェックのみ」表示中は無効)
  const handle = row.querySelector('.drag-handle');
  if(list.filter !== 'all'){
    handle.disabled = true;
    handle.classList.add('disabled');
  }else{
    handle.addEventListener('pointerdown', (e)=> startDrag(e, wrap, node, list));
  }

  wrap.appendChild(row);

  // 全チェック/全解除(このノード配下すべて)
  if(hasChildren){
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
  }

  if(hasChildren && !node.collapsed){
    const childWrap = document.createElement('div');
    childWrap.className = 'node-children';
    childWrap.dataset.parentId = node.id;
    const visibleChildren = node.children.filter(c => list.filter!=='unchecked' || nodeHasVisibleDescendant(c));
    visibleChildren.forEach((child, i)=>{
      const el = renderNode(child, list, depth+1);
      if(i === visibleChildren.length-1) markLastInGroup(el);
      childWrap.appendChild(el);
    });
    wrap.appendChild(childWrap);
  }

  return wrap;
}

function focusNodeName(nodeId){
  requestAnimationFrame(()=>{
    const el = treeRoot.querySelector(`[data-id="${nodeId}"] > .node-row > .node-name`);
    if(el){
      el.focus();
      document.execCommand('selectAll', false, null);
    }
  });
}

document.getElementById('btn-add-root-item').addEventListener('click', ()=>{
  const list = findList(state.currentListId);
  const child = newNode();
  list.items.push(child);
  save(); renderDetail();
  focusNodeName(child.id);
});

document.querySelectorAll('.seg-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const list = findList(state.currentListId);
    list.filter = btn.dataset.filter;
    save(); renderDetail();
  });
});

document.getElementById('btn-check-all-list').addEventListener('click', ()=>{
  const list = findList(state.currentListId);
  list.items.forEach(n => setCheckedRecursive(n, true));
  save(); renderDetail();
});
document.getElementById('btn-uncheck-all-list').addEventListener('click', ()=>{
  const list = findList(state.currentListId);
  list.items.forEach(n => setCheckedRecursive(n, false));
  save(); renderDetail();
});

// ===== ドラッグ&ドロップで並び替え・階層移動 =====
const LONG_PRESS_MS = 180;
const MOVE_CANCEL_PX = 10;
let dragCtx = null;

function isDescendant(node, id){
  return node.children.some(c => c.id === id || isDescendant(c, id));
}

function clearDropHighlights(){
  document.querySelectorAll('.node-row.drop-before, .node-row.drop-after, .node-row.drop-nest')
    .forEach(el => el.classList.remove('drop-before','drop-after','drop-nest'));
}

function startDrag(e, wrap, node, list){
  const startX = e.clientX, startY = e.clientY;
  const pointerId = e.pointerId;
  let longPressTimer = null;
  let activated = false;

  function cleanupPending(){
    clearTimeout(longPressTimer);
    document.removeEventListener('pointermove', onPreMove);
    document.removeEventListener('pointerup', onPreUp);
  }

  function onPreMove(ev){
    if(ev.pointerId !== pointerId) return;
    const dx = ev.clientX - startX, dy = ev.clientY - startY;
    if(Math.hypot(dx,dy) > MOVE_CANCEL_PX) cleanupPending();
  }
  function onPreUp(ev){
    if(ev.pointerId !== pointerId) return;
    cleanupPending();
  }

  document.addEventListener('pointermove', onPreMove);
  document.addEventListener('pointerup', onPreUp);

  longPressTimer = setTimeout(()=>{
    cleanupPending();
    activated = true;
    activateDrag();
  }, LONG_PRESS_MS);

  let ghost = null;

  function activateDrag(){
    wrap.classList.add('dragging');
    try{ wrap.setPointerCapture(pointerId); }catch(_){/* noop */}
    dragCtx = { pointerId, dropTargetId:null, dropMode:null };

    ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.textContent = node.name || '(無題の項目)';
    document.body.appendChild(ghost);
    positionGhost(startX, startY);

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function positionGhost(x, y){
    if(ghost){ ghost.style.left = x + 'px'; ghost.style.top = y + 'px'; }
  }

  function onMove(ev){
    if(!dragCtx || ev.pointerId !== dragCtx.pointerId) return;
    ev.preventDefault();
    positionGhost(ev.clientX, ev.clientY);
    clearDropHighlights();
    dragCtx.dropTargetId = null;
    dragCtx.dropMode = null;

    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const targetRow = el && el.closest && el.closest('.node-row');
    if(!targetRow) return;
    const targetWrap = targetRow.closest('.node');
    if(!targetWrap) return;
    const targetId = targetWrap.dataset.id;
    if(targetId === node.id) return;
    if(isDescendant(node, targetId)) return; // 自分の子孫の上には置けない(循環防止)

    const rect = targetRow.getBoundingClientRect();
    const relY = (ev.clientY - rect.top) / rect.height;
    let mode;
    if(relY < 0.28) mode = 'before';
    else if(relY > 0.72) mode = 'after';
    else mode = 'nest';

    dragCtx.dropTargetId = targetId;
    dragCtx.dropMode = mode;
    targetRow.classList.add(mode === 'nest' ? 'drop-nest' : (mode === 'before' ? 'drop-before' : 'drop-after'));
  }

  function onUp(ev){
    if(!dragCtx || ev.pointerId !== dragCtx.pointerId) return;
    const { dropTargetId, dropMode } = dragCtx;
    dragCtx = null;
    wrap.classList.remove('dragging');
    clearDropHighlights();
    if(ghost){ ghost.remove(); ghost = null; }
    try{ wrap.releasePointerCapture(ev.pointerId); }catch(_){/* noop */}
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);

    if(dropTargetId && dropMode){
      // 元の場所から取り除く
      const oldArr = findParentArray(list.items, node.id) || list.items;
      const oldIdx = oldArr.findIndex(n => n.id === node.id);
      if(oldIdx > -1) oldArr.splice(oldIdx, 1);

      if(dropMode === 'nest'){
        const targetNode = findNode(list.items, dropTargetId);
        targetNode.children.push(node);
        targetNode.collapsed = false;
      }else{
        const targetArr = findParentArray(list.items, dropTargetId) || list.items;
        const targetIdx = targetArr.findIndex(n => n.id === dropTargetId);
        const insertAt = dropMode === 'before' ? targetIdx : targetIdx + 1;
        targetArr.splice(insertAt, 0, node);
      }
      save();
    }
    renderDetail();
  }

  // 押した瞬間、掴んだのがわかるようにハンドルを少し目立たせる(まだ移動モードではない)
  wrap.classList.add('grab-pending');
  const clearPendingVisual = () => wrap.classList.remove('grab-pending');
  document.addEventListener('pointerup', clearPendingVisual, { once:true });
  document.addEventListener('pointercancel', clearPendingVisual, { once:true });
}

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
