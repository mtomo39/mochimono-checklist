// ===== 持ち物チェックリスト app.js =====
const APP_VERSION = 'v8';
const STORAGE_KEY = 'packing-checklists-v1';
const LIST_COLORS = ['#FF9500','#007AFF','#34C759','#AF52DE','#FF3B30','#5AC8FA','#FFCC00','#FF2D55'];

const uid = () => Math.random().toString(36).slice(2, 10);

let selectedNodeId = null; // 今タップして選択中の項目(この項目だけ操作ボタンを表示する)

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

// node の { 所属している配列, その配列内でのindex, 親ノード(ルート直下ならnull) } を探す
function locate(list, id){
  function search(nodes, parent){
    for(let i=0;i<nodes.length;i++){
      if(nodes[i].id === id) return { arr: nodes, idx: i, parent };
      const found = search(nodes[i].children, nodes[i]);
      if(found) return found;
    }
    return null;
  }
  return search(list.items, null);
}

function setCheckedRecursive(node, value){
  node.checked = value;
  node.children.forEach(c => setCheckedRecursive(c, value));
}

// あるノードから上へ辿りながら、「直下の子が全部チェック済みか」に基づいて
// 親のチェック状態を自動的に揃えていく(子が全部揃えば親もON、揃わなければ親はOFF)
function syncCheckedUpward(list, nodeId){
  let current = findNode(list.items, nodeId);
  while(current){
    if(current.children.length > 0){
      current.checked = current.children.every(c => c.checked);
    }
    const loc = locate(list, current.id);
    current = loc.parent;
  }
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
  selectedNodeId = null;
  viewDetail.classList.add('hidden');
  viewLists.classList.remove('hidden');
  renderLists();
  save();
}
function showDetail(id, focusTitle=false){
  state.currentListId = id;
  selectedNodeId = null;
  viewDetail.classList.remove('hidden');
  viewLists.classList.add('hidden');
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
  const isEditing = active && ((active.classList && active.classList.contains('node-name')) || active === detailTitle);
  if(isEditing){
    active.blur();
    e.preventDefault();
    e.stopImmediatePropagation(); // 同じ要素の他のリスナー(実際の追加処理)も止める
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
  row.className = 'node-row' + (node.checked ? ' checked' : '') + (node.id === selectedNodeId ? ' selected' : '');

  const hasChildren = node.children.length>0;
  const loc = locate(list, node.id);
  const canUp = loc.idx > 0;
  const canDown = loc.idx < loc.arr.length - 1;
  const canOutdent = loc.parent !== null; // ルート直下なら上の階層はない
  const canIndent = loc.idx > 0; // 直前の兄弟がいないと子にできない

  row.innerHTML = `
    ${hasChildren ? `<button class="node-toggle-collapse">${node.collapsed?'▶':'▼'}</button>` : '<span style="width:34px;flex-shrink:0"></span>'}
    <button class="check-circle${node.checked?' checked':''}" aria-label="チェック"></button>
    <span class="node-name" contenteditable="true" spellcheck="false" data-placeholder="新規項目"></span>
    ${hasChildren ? `<span class="node-count"></span>` : ''}
    <button class="act-del danger" title="削除">🗑</button>
  `;
  row.querySelector('.node-name').textContent = node.name;

  // タップでこの項目を選択状態にする(選択中の項目だけ下に操作ボタンを出す)
  row.addEventListener('click', ()=>{
    if(selectedNodeId !== node.id){
      selectedNodeId = node.id;
      renderDetail();
    }
  });

  if(hasChildren){
    const {total, checked} = countDirect(node);
    row.querySelector('.node-count').textContent = `${checked}/${total}`;
    row.querySelector('.node-toggle-collapse').addEventListener('click', (e)=>{
      e.stopPropagation();
      node.collapsed = !node.collapsed;
      save(); renderDetail();
    });
  }

  // チェックの切り替え(子階層へは強制的に、親階層へは「全部揃ったか」で連動する)
  row.querySelector('.check-circle').addEventListener('click', ()=>{
    setCheckedRecursive(node, !node.checked);
    syncCheckedUpward(list, node.id);
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

  row.querySelector('.act-del').addEventListener('click', ()=>{
    if(hasChildren && !confirm(`「${node.name}」を削除する?(子項目も全部消えるよ)`)) return;
    const l2 = locate(list, node.id);
    const parentId = l2.parent ? l2.parent.id : null;
    l2.arr.splice(l2.idx, 1);
    if(parentId) syncCheckedUpward(list, parentId);
    save(); renderDetail();
  });

  wrap.appendChild(row);

  // ===== 移動・階層操作・追加ボタン(選択中の項目だけ表示) =====
  if(node.id === selectedNodeId){
    const toolsrow = document.createElement('div');
    toolsrow.className = 'node-toolsrow';
    toolsrow.innerHTML = `
      <button class="tool-btn act-up" title="上へ移動" ${canUp?'':'disabled'}>↑</button>
      <button class="tool-btn act-down" title="下へ移動" ${canDown?'':'disabled'}>↓</button>
      <button class="tool-btn act-outdent" title="上の階層へ移動" ${canOutdent?'':'disabled'}>⇤</button>
      <button class="tool-btn act-indent" title="ひとつ上の項目の子にする" ${canIndent?'':'disabled'}>⇥</button>
      <span class="tool-sep"></span>
      <button class="tool-btn tool-btn-text act-add-sibling" title="同じ階層に項目を追加">＋同階層</button>
      <button class="tool-btn tool-btn-text act-add-child" title="子項目として追加">＋子項目</button>
    `;

    toolsrow.querySelector('.act-up').addEventListener('click', (e)=>{
      e.stopPropagation();
      const l = locate(list, node.id);
      if(l.idx > 0){
        [l.arr[l.idx-1], l.arr[l.idx]] = [l.arr[l.idx], l.arr[l.idx-1]];
        save(); renderDetail();
      }
    });
    toolsrow.querySelector('.act-down').addEventListener('click', (e)=>{
      e.stopPropagation();
      const l = locate(list, node.id);
      if(l.idx < l.arr.length-1){
        [l.arr[l.idx+1], l.arr[l.idx]] = [l.arr[l.idx], l.arr[l.idx+1]];
        save(); renderDetail();
      }
    });
    toolsrow.querySelector('.act-outdent').addEventListener('click', (e)=>{
      e.stopPropagation();
      const l = locate(list, node.id);
      if(!l.parent) return; // すでにルート直下
      const oldParentId = l.parent.id;
      const grand = locate(list, l.parent.id);
      const [moved] = l.arr.splice(l.idx, 1);
      grand.arr.splice(grand.idx+1, 0, moved);
      syncCheckedUpward(list, oldParentId);
      save(); renderDetail();
    });
    toolsrow.querySelector('.act-indent').addEventListener('click', (e)=>{
      e.stopPropagation();
      const l = locate(list, node.id);
      if(l.idx === 0) return; // 直前の兄弟がいない
      const prevSibling = l.arr[l.idx-1];
      const [moved] = l.arr.splice(l.idx, 1);
      prevSibling.children.push(moved);
      prevSibling.collapsed = false;
      syncCheckedUpward(list, prevSibling.id);
      save(); renderDetail();
    });

    const addSiblingBtn = toolsrow.querySelector('.act-add-sibling');
    addSiblingBtn.addEventListener('click', guardAddClick, true);
    addSiblingBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const l = locate(list, node.id);
      const child = newNode();
      l.arr.splice(l.idx+1, 0, child);
      if(l.parent) syncCheckedUpward(list, l.parent.id);
      selectedNodeId = child.id;
      save(); renderDetail();
      focusNodeName(child.id);
    });

    const addChildBtn = toolsrow.querySelector('.act-add-child');
    addChildBtn.addEventListener('click', guardAddClick, true);
    addChildBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const child = newNode();
      node.children.push(child);
      node.collapsed = false;
      syncCheckedUpward(list, node.id);
      selectedNodeId = child.id;
      save(); renderDetail();
      focusNodeName(child.id);
    });

    wrap.appendChild(toolsrow);
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
  selectedNodeId = child.id;
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
const versionEl = document.getElementById('app-version');
if(versionEl) versionEl.textContent = APP_VERSION;
showLists();
