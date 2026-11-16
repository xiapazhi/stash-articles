/* Component tests: NODE_PATH=<React 18 test dependencies> node test-mobile.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const TestRenderer = require('react-test-renderer');
const {act} = TestRenderer;
const h = React.createElement;
const patches = new Map();
const mediaListeners = new Set();
const calls = [];
let mobile = true;
let route = '/scenes';
const ProviderMarker = React.createContext('missing-provider');
const ModalClose = React.createContext(null);

function Button({children, ...props}) { return h('button', props, children); }
function Modal(props) {
  React.useEffect(() => { if (!props.show) props.onExited?.(); }, [props.show]);
  return props.show ? h(ModalClose.Provider, {value: props.onHide},
    h('section', {role:'dialog'}, props.children)) : null;
}
Modal.Header = function Header({children}) {
  const close = React.useContext(ModalClose);
  return h('header', null, children, h('button', {onClick:close}, '关闭面板'));
};
Modal.Title = ({children}) => h('h2', null, children);
Modal.Body = ({children}) => h('article', null, children);
Modal.Footer = ({children}) => h('footer', null, children);
const Form = {
  Group: ({children}) => h('div', null, children),
  Label: ({children,...props}) => h('label',props,children),
  Control: ({as='input',children,...props}) => h(as,props,children),
};
const context = {
  console:{info(){},error(){}},
  window:{matchMedia:()=>({get matches(){return mobile;}, addEventListener:(_,fn)=>mediaListeners.add(fn),removeEventListener:(_,fn)=>mediaListeners.delete(fn)})},
};
context.window.PluginApi = {
  React,
  libraries:{FontAwesomeSolid:{faSliders:{},faSort:{},faThLarge:{},faCheck:{}},Bootstrap:{Button,Modal,Form,Alert:({children,...props})=>h('aside',props,children)},Intl:{useIntl:()=>({formatMessage:({id})=>id})},ReactRouterDOM:{useLocation:()=>({pathname:route})}},
  components:{Icon:()=>null,ScenePlayer:(props)=>h('video',{'data-scene':props.scene.id,autoPlay:props.autoplay})},
  hooks:{useLoadComponents:()=>false},
  loadableComponents:{ScenePlayer:()=>Promise.resolve()},
  GQL:{useFindSceneQuery:({variables})=>({data:{findScene:{id:variables.id}}})},
  utils:{StashService:{useConfiguration:()=>({data:{configuration:{interface:{sfwContentMode:false}}}})}},
  patch:{after:(name,fn)=>patches.set(name,fn)},
};
const source=fs.readFileSync(path.join(__dirname,'mobileFilters.js'),'utf8');
vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, 'globalThis.testAPI={findBindings,transformTree};})();'),context);

function makeFilter(values={}) {
  return {
    searchTerm:'原有搜索', criteria:[], sortBy:'date', sortDirection:'DESC', displayMode:0, zoomIndex:1, itemsPerPage:77,
    options:{sortByOptions:[{value:'date',messageID:'日期'},{value:'random',messageID:'随机'}],displayModeOptions:[0,1,2]},
    setSortBy(value){calls.push(['sort',value]);return makeFilter({...this,sortBy:value});},
    toggleSortDirection(){calls.push(['direction']);return makeFilter({...this,sortDirection:this.sortDirection==='ASC'?'DESC':'ASC'});},
    reshuffleRandomSort(){calls.push(['reshuffle']);return makeFilter({...this,randomSeed:123});},
    setDisplayMode(value){calls.push(['display',value]);return makeFilter({...this,displayMode:value});},
    setZoom(value){calls.push(['zoom',value]);return makeFilter({...this,zoomIndex:value});},
    setPageSize(value){calls.push(['pageSize',value]);return makeFilter({...this,itemsPerPage:value});},
    clearCriteria(includeSearch){calls.push(['reset',includeSearch]);return makeFilter({...this,criteria:[],searchTerm:includeSearch?'':this.searchTerm});},
    ...values,
  };
}

let latestFilter;
let latestSetFilter;
function NativeToolbar(props) { return h('div',{className:'native-toolbar',nativeProps:props},props.operationComponent); }
function NativeSidebar(props) {
  const marker=React.useContext(ProviderMarker);
  return h('div',null,marker,h('button',{onClick:()=>props.setFilter(current=>makeFilter({...current,criteria:[{id:'tag'}]}))},'原生标签条件'));
}
function SidebarContainer({children}) {return h('div',null,children);}
function Pane({children}) {return h('div',null,children);}
function Result({children}) {return h('div',null,children);}
function NativeOperations(props) {return h('div',{className:'native-operations',nativeProps:props},'原生更多菜单');}

function FixturePage({hook='FilteredSceneList',loading=false,error,selected=false,count=12}) {
  const [filter,setFilter]=React.useState(()=>makeFilter());
  latestFilter=filter;
  latestSetFilter=setFilter;
  const operation=h(NativeOperations,{operations:[{text:'随机播放',icon:'play',onClick:()=>calls.push(['play'])}]});
  const toolbar=h(NativeToolbar,{filter,setFilter,listSelect:{selectedIds:new Set(selected?['1']:[])},showEditFilter:()=>calls.push(['advanced']),operationComponent:operation,zoomable:true});
  const sidebar=h(NativeSidebar,{filter,setFilter,sidebarOpen:false,onClose:()=>{},count});
  const tree=h('div',{className:'native-page'},h(ProviderMarker.Provider,{value:'provider-alive'},
    h(Pane,{hideSidebar:true},h(SidebarContainer,{hide:true,onHide:()=>{}},sidebar),
      toolbar,h(Result,{loading,error},h('p',null,'结果卡片')),
      h('span',{totalItems:count,itemsPerPage:77,currentPage:1},'分页'))));
  return patches.get(hook)({}, {}, h(React.Fragment, null, tree));
}
function text(node) {
  if (typeof node==='string') return node;
  if (Array.isArray(node)) return node.map(text).join('');
  return node?.children?.map(text).join('')||'';
}
function button(renderer,label) {
  const found=renderer.root.findAllByType('button').find(node=>text(node.toJSON?.()||{children:node.children})===label);
  assert(found,`Missing button: ${label}`);
  return found;
}
function click(renderer,label) {act(()=>button(renderer,label).props.onClick());}
function mount(props={}) {let renderer;act(()=>{renderer=TestRenderer.create(h(FixturePage,props));});return renderer;}
function finish(renderer) {act(()=>renderer.unmount());}
let passed=0;
function test(name,fn) {calls.length=0;mobile=true;route='/scenes';fn();passed++;console.log('PASS',name);}

test('registers eight native page patches and a video thumbnail patch',()=>assert.equal(patches.size,9));
test('fragment page roots receive a real DOM scope for sticky toolbar and image preview styles',()=>{
  const r=mount();const scope=r.root.findByType('div');assert.equal(scope.props.className,'smf-enabled');finish(r);
});
test('all eight shared native page structures are adapted',()=>{
  for(const hook of [...patches.keys()].filter(name=>name!=='SceneCard')) {const r=mount({hook});assert.equal(r.root.findAll(node=>node.props.className==='smf-actions').length,1);finish(r);}
});
test('desktop is returned without mobile markup',()=>{mobile=false;const r=mount();assert.equal(r.root.findAll(node=>node.props.className==='smf-actions').length,0);assert.equal(r.root.findAllByType(NativeToolbar).length,1);finish(r);});
test('details and article routes are excluded',()=>{
  for(const excluded of ['/articles','/scenes/123','/images/9','/settings']) {route=excluded;const r=mount();assert.equal(r.root.findAll(node=>node.props.className==='smf-actions').length,0);finish(r);}
});
test('missing expected native bindings safely falls back',()=>assert.equal(context.testAPI.findBindings(h('div',null,'unrelated')),null));
test('filter panel preserves provider and native immediate-update callback',()=>{
  const r=mount();click(r,'筛选');assert(text(r.toJSON()).includes('provider-alive'));
  click(r,'原生标签条件');assert.equal(latestFilter.criteria.length,1);assert.equal(r.root.findAllByProps({role:'dialog'}).length,1);
  assert.equal(r.root.findByType(NativeSidebar).props.setFilter,latestSetFilter);
  click(r,'重置条件');assert.equal(latestFilter.criteria.length,0);assert.equal(latestFilter.searchTerm,'原有搜索');assert.equal(latestFilter.sortBy,'date');assert.equal(latestFilter.displayMode,0);assert.deepEqual(calls.at(-1),['reset',false]);
  click(r,'查看 12 项结果');assert.equal(r.root.findAllByProps({role:'dialog'}).length,0);finish(r);
});
test('native search and operations callbacks are retained',()=>{
  const r=mount();const native=r.root.findByType(NativeToolbar);assert.equal(native.props.setFilter,latestSetFilter);
  const operations=r.root.findByType(NativeOperations).props.operations;
  assert.equal(operations[0].icon,undefined);act(()=>operations[0].onClick());assert.deepEqual(calls.at(-1),['play']);finish(r);
});
test('sorting and direction call model methods then close',()=>{
  const r=mount();click(r,'排序：日期 ↓');click(r,'随机');assert.equal(latestFilter.sortBy,'random');assert.equal(r.root.findAllByProps({role:'dialog'}).length,0);
  click(r,'排序：随机 ↓');click(r,'升序 ↑');assert.equal(latestFilter.sortDirection,'ASC');
  click(r,'排序：随机 ↑');click(r,'重新随机排序');assert.deepEqual(calls.at(-1),['reshuffle']);finish(r);
});
test('display exposes only supported modes and preserves current custom page size',()=>{
  const r=mount();click(r,'显示');assert(text(r.toJSON()).includes('77 项'));assert(!text(r.toJSON()).includes('标记器'));
  click(r,'列表');assert.equal(latestFilter.displayMode,1);assert.equal(r.root.findAllByProps({role:'dialog'}).length,1);
  const select=r.root.findByProps({id:'smf-page-size'});act(()=>select.props.onChange({target:{value:'40'}}));assert.equal(latestFilter.itemsPerPage,40);
  click(r,'网格');act(()=>r.root.findByProps({id:'smf-zoom'}).props.onChange({target:{value:'3'}}));assert.equal(latestFilter.zoomIndex,3);finish(r);
});
test('custom page sizes reject invalid values before changing native state',()=>{
  const r=mount();click(r,'显示');act(()=>r.root.findByProps({id:'smf-page-size'}).props.onChange({target:{value:'custom'}}));
  act(()=>r.root.findByProps({id:'smf-custom-size'}).props.onChange({target:{value:'-1'}}));click(r,'设置每页数量');assert.equal(latestFilter.itemsPerPage,77);
  act(()=>r.root.findByProps({id:'smf-custom-size'}).props.onChange({target:{value:'99'}}));click(r,'设置每页数量');assert.equal(latestFilter.itemsPerPage,99);finish(r);
});
test('loading and failure suppress stale counts without clearing conditions',()=>{
  const r=mount({loading:true});click(r,'筛选');assert(text(r.toJSON()).includes('正在更新结果'));assert(!text(r.toJSON()).includes('12 项结果'));
  click(r,'原生标签条件');act(()=>r.update(h(FixturePage,{error:new Error('offline')})));
  assert(text(r.toJSON()).includes('结果更新失败'));assert(!text(r.toJSON()).includes('12 项结果'));assert.equal(latestFilter.criteria.length,1);finish(r);
});
test('advanced editor opens only after the sheet closes',()=>{
  const r=mount();click(r,'筛选');click(r,'高级条件（应用后生效）');assert.equal(r.root.findAllByProps({role:'dialog'}).length,0);assert.deepEqual(calls,[['advanced']]);finish(r);
});
test('selection mode keeps the unmodified native toolbar',()=>{
  const r=mount({selected:true});assert.equal(r.root.findAll(node=>node.props.className==='smf-actions').length,0);
  const native=r.root.findByType(NativeToolbar);assert(native.props.operationComponent.props.operations[0].icon);finish(r);
});
test('crossing to desktop closes the sheet and restores native rendering',()=>{
  const r=mount();click(r,'筛选');mobile=false;act(()=>{for(const update of mediaListeners)update();});
  assert.equal(r.root.findAllByProps({role:'dialog'}).length,0);assert.equal(r.root.findAll(node=>node.props.className==='smf-actions').length,0);finish(r);
});
test('mobile video thumbnail opens native player and closes without changing title or selection',()=>{
  function Card(props){return h('div',null,props.image,h('a',{href:props.url},'视频标题'));}
  const original={scene:{id:'1',title:'测试视频',files:[{}]},selecting:false};
  const tree=h(Card,{url:'/scenes/1',image:h('img',{src:'poster.jpg'})});
  let r;act(()=>{r=TestRenderer.create(patches.get('SceneCard')(original,{},tree));});
  let prevented=false;let stopped=false;
  const thumbnail=r.root.find(node=>typeof node.props.onClickCapture==='function');
  act(()=>thumbnail.props.onClickCapture({button:0,preventDefault(){prevented=true;},stopPropagation(){stopped=true;}}));
  assert(prevented&&stopped);assert.equal(r.root.findByType('video').props.autoPlay,true);
  assert.equal(r.root.findByType('a').props.href,'/scenes/1');
  click(r,'关闭面板');assert.equal(r.root.findAllByType('video').length,0);finish(r);
  for(const options of [{mobile:false},{selecting:true},{route:'/scenes/1'}]){
    mobile=options.mobile??true;route=options.route??'/scenes';
    act(()=>{r=TestRenderer.create(patches.get('SceneCard')({...original,selecting:options.selecting??false},{},tree));});
    assert.equal(r.root.findAll(node=>typeof node.props.onClickCapture==='function').length,0);finish(r);
  }
});
console.log(`All ${passed} component tests passed.`);
