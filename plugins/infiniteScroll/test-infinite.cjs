// Run with React 18 and react-test-renderer available in node_modules.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const Renderer = require('react-test-renderer');
const {act} = Renderer;
const h = React.createElement;
const after = new Map();
const instead = new Map();
const observers = new Set();
const requests = [];
const writes = [];
const opened = [];
let route = '/images';
let cache;
let updateCache;
let viewer;
let renderer;

class Observer {
  constructor(callback) { this.callback = callback; }
  observe() { observers.add(this); }
  disconnect() { observers.delete(this); }
}
const client = {
  query(options) {
    return new Promise((resolve,reject)=>requests.push({options,resolve,reject}));
  },
  cache: {updateQuery(options,update) {
    writes.push(options);
    cache=update(cache);
    updateCache(cache);
  }},
};
function Button({children,...props}) {return h('button',props,children);}
function useLightbox(state) {
  React.useEffect(()=>{viewer=state;},[state.images,state.page,state.onClose,state.pageCallback]);
  return options=>opened.push(options);
}
const context = {
  console:{info(){},error(){}},
  window:{IntersectionObserver:Observer,location:{get pathname(){return route;}}},
};
context.window.PluginApi={React,
  libraries:{Bootstrap:{Button,Alert:({children,...props})=>h('aside',props,children)},ReactRouterDOM:{useLocation:()=>({pathname:route})}},
  hooks:{useLightbox},
  GQL:{FindImagesDocument:'images',FindGalleriesDocument:'galleries'},
  utils:{StashService:{getClient:()=>client}},
  patch:{after:(name,callback)=>after.set(name,callback),instead:(name,callback)=>instead.set(name,callback)},
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'infiniteScroll.js'),'utf8').replace(/\}\)\(\);\s*$/,'globalThis.testAPI={mergeItems,supportsRoute,prepareList};})();'),context);

function filter(values={}) {
  return {currentPage:1,itemsPerPage:2,searchTerm:'',sortBy:'path',sortDirection:'ASC',displayMode:0,
    makeFindFilter(){return {page:this.currentPage,per_page:this.itemsPerPage,q:this.searchTerm,sort:this.sortBy,direction:this.sortDirection};},
    makeFilter(){return this.criteria||{};},
    clone(){return filter({...this});},...values};
}
function ImageGrid(props) {return h('div',{className:'test-grid',items:props.images},props.images.map((item,index)=>h('button',{key:item.id,onClick:event=>props.onPreview(index,event)},item.id)));}
function GalleryGrid(props) {return h('div',{className:'test-gallery',items:props.galleries},props.galleries.map(item=>h('span',{key:item.id},item.id)));}
function NativeImages(props) {
  // Mirrors the native list's lightbox hook, so our viewer must take over only on open.
  useLightbox({images:props.images,page:props.filter.currentPage});
  return after.get('ImageList')(props,{},h(ImageGrid,{images:props.images,onPreview(){}}));
}
function NativeGalleries(props) {return h(GalleryGrid,props);}
const initialItems=[{id:'1'},{id:'2'}];
function Fixture({kind='images',model,selected=false,filterHook,total=6}) {
  const field=kind==='images'?'findImages':'findGalleries';
  const [data,setData]=React.useState(()=>({[field]:{[kind]:initialItems,count:total}}));
  cache=data;updateCache=setData;
  const props={filter:model,[kind]:data[field][kind],totalCount:kind==='images'?data[field].count:undefined,selectedIds:new Set(selected?['1']:[])};
  const list=kind==='images'?h(NativeImages,props):instead.get('GalleryList')(props,{},NativeGalleries);
  const tree=h('div',{className:'item-list-container image-list'},list,h('span',{totalItems:data[field].count,itemsPerPage:2},'native pagination'));
  return after.get(kind==='images'?'FilteredImageList':'FilteredGalleryList')({filterHook},{},tree);
}
function ids(items) {return Array.from(items,item=>item.id);}
function text(node) {if(typeof node==='string')return node;if(Array.isArray(node))return node.map(text).join('');return node?.children?.map(text).join('')||'';}
async function mount(props={}) {await act(async()=>{renderer=Renderer.create(h(Fixture,{model:filter(),...props}),{createNodeMock:()=>({})});});}
async function unmount() {await act(async()=>renderer?.unmount());renderer=null;observers.clear();}
async function intersect() {await act(async()=>{for(const observer of [...observers])observer.callback([{isIntersecting:true}]);});}
async function respond(index,items,count=6) {const req=requests[index];const kind=req.options.query;const field=kind==='images'?'findImages':'findGalleries';await act(async()=>req.resolve({data:{[field]:{[kind]:items,count}}}));}
async function click(label) {const button=renderer.root.findAllByType('button').find(item=>text(item)===label);assert(button,`Missing button ${label}`);await act(async()=>{button.props.onClick({preventDefault(){}});});}
async function test(name,run) {route='/images';requests.length=0;writes.length=0;opened.length=0;viewer=null;try{await run();console.log('PASS',name);}finally{await unmount();}}

(async()=>{
  await test('supported routes exclude unrelated lists and details',async()=>{
    const {supportsRoute}=context.testAPI;
    assert(supportsRoute('/images','images'));assert(supportsRoute('/galleries/3','images'));assert(supportsRoute('/galleries','galleries'));
    for(const pathname of ['/images/3','/scenes','/galleries/new','/performers/2'])assert(!supportsRoute(pathname,'images'));
  });
  await test('native single-child bindings survive both mobile plugin loading orders',async()=>{
    const sidebar=h('section',{sidebarOpen:true});
    const tree=h('div',{className:'item-list-container'},h('aside',{hide:true},sidebar),h('span',{totalItems:12,itemsPerPage:2}));
    const bindings={};const transformed=context.testAPI.prepareList(tree,bindings);
    assert(!Array.isArray(transformed.props.children[0].props.children));
    assert.equal(transformed.props.children[0].props.children.props.sidebarOpen,true);
    assert.equal(bindings.totalCount,12);assert(transformed.props.className.includes('sis-page'));
    function MobileList(){return null;}
    const wrapped=context.testAPI.prepareList(h(MobileList,{tree}),{});
    assert(wrapped.props.tree.props.className.includes('sis-page'));
  });
  await test('observer loads exactly one next page and appends through native cache',async()=>{
    await mount();await intersect();await intersect();assert.equal(requests.length,1);
    assert.equal(requests[0].options.variables.filter.page,2);assert.equal(requests[0].options.variables.filter.per_page,2);
    await respond(0,[{id:'3'},{id:'4'}]);
    assert.deepEqual(ids(cache.findImages.images),['1','2','3','4']);
    assert.equal(renderer.root.findByType(ImageGrid).props.images.length,4);
    await intersect();assert.equal(requests[1].options.variables.filter.page,3);
    await respond(1,[{id:'5'},{id:'6'}]);await intersect();assert.equal(requests.length,2);
    assert(text(renderer.toJSON()).includes('已到底部'));
  });
  await test('failed requests retain items and retry the same page without an automatic retry loop',async()=>{
    await mount();await intersect();await act(async()=>requests[0].reject(new Error('offline')));
    assert.equal(cache.findImages.images.length,2);assert(text(renderer.toJSON()).includes('加载下一页失败'));
    await intersect();assert.equal(requests.length,1);await click('重试');assert.equal(requests[1].options.variables.filter.page,2);
    await respond(1,[{id:'3'}],3);assert.equal(cache.findImages.images.length,3);
  });
  await test('duplicate image IDs are not appended twice',async()=>{
    await mount();await intersect();await respond(0,[{id:'2'},{id:'3'}]);
    assert.deepEqual(ids(cache.findImages.images),['1','2','3']);
  });
  await test('gallery scope is included in every request without changing search or sort',async()=>{
    route='/galleries/12';await mount({model:filter({searchTerm:'中文',sortBy:'date'}),filterHook:model=>filter({...model,criteria:{galleries:{value:['12'],modifier:'INCLUDES'}}})});
    await intersect();const vars=requests[0].options.variables;
    assert.equal(vars.filter.q,'中文');assert.equal(vars.filter.sort,'date');assert.deepEqual(vars.image_filter.galleries.value,['12']);
  });
  await test('late responses from a previous filter cannot update the new list',async()=>{
    const original=filter();await mount({model:original});await intersect();
    await act(async()=>renderer.update(h(Fixture,{model:filter({searchTerm:'new'})})));
    await respond(0,[{id:'old-result'}]);assert.equal(writes.length,0);
    await intersect();assert.equal(requests[1].options.variables.filter.q,'new');
  });
  await test('selection pauses loading and the native selection dataset includes appended items',async()=>{
    await mount({selected:true});await intersect();assert.equal(requests.length,0);
    assert(text(renderer.toJSON()).includes('选择期间暂停加载'));
    await act(async()=>renderer.update(h(Fixture,{model:filter(),selected:false})));
    await intersect();await respond(0,[{id:'3'},{id:'4'}]);assert.equal(cache.findImages.images.length,4);
  });
  await test('gallery list appends results while retaining its native renderer',async()=>{
    route='/galleries';await mount({kind:'galleries'});await intersect();await respond(0,[{id:'3'},{id:'4'}]);
    assert.equal(renderer.root.findByType(GalleryGrid).props.galleries.length,4);
  });
  await test('clicking a newly loaded image opens the correct native viewer page and index',async()=>{
    await mount();await intersect();await respond(0,[{id:'3'},{id:'4'}]);await click('4');
    assert.equal(opened[0].page,2);assert.equal(opened[0].initialIndex,1);
    assert.deepEqual(ids(opened[0].images),['3','4']);
    await act(async()=>{viewer.pageCallback({direction:1});});await respond(1,[{id:'5'},{id:'6'}]);
    assert.equal(viewer.page,3);assert.deepEqual(ids(viewer.images),['5','6']);
    assert.equal(cache.findImages.images.length,4);
  });
  await test('a list response arriving while the viewer is open is committed after close',async()=>{
    await mount();await intersect();await click('1');await respond(0,[{id:'3'},{id:'4'}]);
    assert.equal(cache.findImages.images.length,2);
    await act(async()=>viewer.onClose());assert.equal(cache.findImages.images.length,4);
  });
  await test('failed viewer paging releases the native viewer without losing loaded list items',async()=>{
    await mount();await click('1');await act(async()=>{viewer.pageCallback({direction:1});});
    await act(async()=>requests[0].reject(new Error('offline')));
    assert.equal(viewer.images.length,0);assert.equal(cache.findImages.images.length,2);
    await act(async()=>viewer.onClose());assert(text(renderer.toJSON()).includes('查看器翻页失败'));
    await click('1');assert.equal(opened.at(-1).images[0].id,'1');
  });
  await test('empty next page terminates loading even if a server count is stale',async()=>{
    await mount();await intersect();await respond(0,[],10);await intersect();assert.equal(requests.length,1);
    assert(text(renderer.toJSON()).includes('已到底部'));
  });
  console.log('All 13 infinite-scroll component tests passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
