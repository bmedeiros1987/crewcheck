import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {build,transform} from 'esbuild';
const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
let requests=0,writes=0;
globalThis.fetch=()=>{requests++;throw Error('NETWORK_FORBIDDEN');};
const storage={getItem:()=>null,setItem:()=>{writes++;},removeItem:()=>{writes++;}};
globalThis.localStorage=storage;globalThis.sessionStorage=storage;
const bundle=await build({stdin:{contents:'export {ConciergeChannels} from "./client/src/components/concierge/ConciergeChannels"; export {openNotificationSettings,focusPendingNotificationSection} from "./client/src/lib/notificationNavigation";',resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',loader:{'.css':'empty'},external:['react','react/*']});
const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports);
const {ConciergeChannels,openNotificationSettings,focusPendingNotificationSection}=module.exports;
let events=[],focus=0,scroll=0;
class Details{constructor(parentElement=null){this.parentElement=parentElement;this.open=false;}querySelector(){return{focus:()=>focus++};}scrollIntoView(){scroll++;}}
const parent=new Details(),channels=new Details(parent),phone=new Details();let mounted=false;
globalThis.HTMLDetailsElement=Details;
globalThis.document={getElementById:id=>id==='cc-notification-phone'?phone:null,querySelector:selector=>mounted&&selector==='.cc-notification-channels'?channels:null,querySelectorAll:()=>[]};
globalThis.requestAnimationFrame=fn=>fn();
globalThis.window=new EventTarget();window.addEventListener('crewcheck:set-view',event=>events.push(event.detail));
const tree=ConciergeChannels(),button=tree.props.children.find(child=>child?.type==='button');
assert.equal(button.props.type,'button');button.props.onClick();
assert.deepEqual(events,['notifications']);assert.equal(writes,0);assert.equal(requests,0);
focusPendingNotificationSection();assert.equal(scroll,0,'pending destination survives before mount');
mounted=true;focusPendingNotificationSection();assert(channels.open&&parent.open);assert.equal(focus,1);assert.equal(scroll,1);
focusPendingNotificationSection();assert.equal(scroll,1,'focus consumed once');
openNotificationSettings('phone');focusPendingNotificationSection();assert(phone.open);assert.equal(scroll,2,'legacy phone destination preserved');
openNotificationSettings('unknown');focusPendingNotificationSection();assert.equal(scroll,2);assert.equal(events.at(-1),'notifications');
const html=renderToStaticMarkup(React.createElement(ConciergeChannels));
assert.match(html,/aria-labelledby="cc-concierge-channels-title"/);assert.match(html,/<h2 id="cc-concierge-channels-title">/);
assert.match(html,/Abrir vínculos de WhatsApp e Telegram/);assert.match(html,/não é necessário gerar outro código/);assert.match(html,/não ativa avisos nem confirma entrega/);
assert(!html.includes('<input')&&!html.includes('<form'),'navigation does not duplicate consent or linking forms');

// Execute the actual pre-JSX hook/effect code without browser/DOM. This is a
// bounded navigation regression, not a visual or React browser certification.
const source=fs.readFileSync(process.env.CONCIERGE_TOUR_SOURCE||'client/src/components/v1432/FirstAccessTour.tsx','utf8');
const prefix=source.slice(source.indexOf('const TOUR_SEEN_KEY'),source.indexOf('  if (!open) return null;')).replace('export default function','function');
const compiled=await transform(prefix+'\n return {goToStep:typeof goToStep === "function"?goToStep:()=>{},finish};\n}\nreturn FirstAccessTour;', {loader:'tsx',target:'es2022'});
for(const currentView of ['notifications','concierge','roster']){
 const effects=[],navigations=[];const icons=['Plane','CalendarDays','Send','BookOpen','Bell','Clock3','CloudSun','HeartPulse'].map(()=>()=>null);
 window.setTimeout=()=>1;window.clearTimeout=()=>{};
 const factory=new Function('useState','useMemo','useEffect','Plane','CalendarDays','Send','BookOpen','Bell','Clock3','CloudSun','HeartPulse',compiled.code);
 const Tour=factory(initial=>[typeof initial==='function'?initial():initial,()=>{}],fn=>fn(),fn=>effects.push(fn),...icons);
 const handlers=Tour({currentView,onNavigate:view=>navigations.push(view)});
 const cleanups=effects.map(fn=>fn());
 assert.deepEqual(navigations,[], 'open tutorial must not override manual navigation or a deep link');
 assert.equal(writes,0,'opening or changing view does not persist tutorial/consent state');
 handlers.goToStep(2);assert.equal(navigations.at(-1),'concierge','explicit next/back navigation still works');
 cleanups.forEach(fn=>fn?.());
}
const steps=source.slice(source.indexOf('const STEPS'),source.indexOf('function shouldStartTour'));
for(const removed of ['30 minutos','alertas automáticos',"view: 'life'", "view: 'weather'", "view: 'regulation'"])assert(!steps.includes(removed));
assert.match(steps,/Menu → Concierge → WhatsApp e Telegram/);assert.match(source,/Abrir Concierge e vínculos/);
assert.match(source,/PASSO \{stepIndex \+ 1\} DE \{STEPS.length\}/);
const home=fs.readFileSync('client/src/pages/Home.tsx','utf8');
assert.equal((home.match(/<ConciergeChannels\/>/g)||[]).length,1);assert.match(home,/\['concierge','Concierge','Vínculos, briefing e consultas',(?:Send|MessageCircle)\]/);
if(process.argv.includes('--prepared')){
 assert(home.includes('className="cc-notification-channels"'),'real prepared canonical link section exists');
 assert(home.includes('onClick={openTelegramBinding}')&&home.includes('onClick={openWhatsAppBinding}'),'existing channel handlers preserved');
}
const css=fs.readFileSync('client/src/components/concierge/concierge-channels.css','utf8');
for(const contract of ['min-width:0','white-space:normal','min-height:48px',':focus-visible','overflow-wrap:anywhere'])assert(css.includes(contract));
assert.equal(requests,0);assert.equal(writes,0);
console.log('PASS real card action -> canonical channels navigation/expansion/focus; legacy phone; actual tour effects preserve three deep links; explicit steps; conservative copy; semantic markup and CSS contracts; zero network/writes. Browser visual verification pending reservation release.');
