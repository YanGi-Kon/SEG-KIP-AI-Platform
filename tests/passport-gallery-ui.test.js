import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
test('gallery accumulates imports, preserves unchecked candidates, and uploads only chosen pages in order',async()=>{
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{files:[],value:'',textContent:'',innerHTML:'',disabled:false,hidden:false,classList:{contains:()=>false}});return nodes.get(id);};
 const bodies=[];class UploadBody{constructor(){this.entries=[];}append(key,value){this.entries.push([key,value]);}}
 const context=vm.createContext({console,TextDecoder,Uint8Array,Map,Set,FormData:UploadBody,setTimeout:()=>1,clearTimeout:()=>{},URL:{createObjectURL:()=> 'blob:preview',revokeObjectURL:()=>{}},document:{getElementById:node,querySelectorAll:()=>[],readyState:'loading',addEventListener:()=>{}},window:{UlchovSheets:{state:{instruments:[]}},WorkspaceApiClient:{workspaceId:()=> 'workspace-a',request:async(_path,options)=>{if(options?.method==='POST'){bodies.push(options.body);return{duplicate:false};}return{passport:null,documents:[],canUpload:true};}}}});
 let source=await fs.readFile(new URL('../public/js/ulchov-passports.js',import.meta.url),'utf8');
 source=source.replace('  window.UlchovPassports=', '  window.galleryTest={importFiles,upload,candidates,chosen,renderGallery,setSelection:()=>{canUpload=true;selection={key:"key",wid:"workspace-a",sheetName:"sheet"};}};\n  window.UlchovPassports=');
 vm.runInContext(source,context);const gallery=context.window.galleryTest;gallery.setSelection();
 const first={name:'first.jpg',size:100,lastModified:1},second={name:'second.jpg',size:100,lastModified:2};
 node('passportFile').files=[first];await gallery.importFiles();node('passportFile').files=[second];await gallery.importFiles();
 assert.equal(gallery.candidates.length,2);assert.equal(gallery.chosen.length,2);
 const firstId=gallery.chosen.shift();gallery.renderGallery();assert.equal(gallery.candidates.length,2);assert.match(node('passportSelectedFiles').innerHTML,/aria-pressed="false"/);
 gallery.chosen.push(firstId);await gallery.upload();
 assert.deepEqual(bodies[0].entries.filter(([key])=>key==='file').map(([,file])=>file.name),['second.jpg','first.jpg']);
 assert.deepEqual(JSON.parse(bodies[0].entries.find(([key])=>key==='pageOrder')[1]),[{fileIndex:0,pageIndex:0},{fileIndex:1,pageIndex:0}]);
 assert.equal(gallery.candidates.length,0);
 node('passportFile').files=[first,second];await gallery.importFiles();gallery.chosen.pop();await gallery.upload();
 assert.equal(gallery.candidates.length,1);assert.equal(gallery.candidates[0].file.name,'second.jpg');assert.equal(gallery.chosen.length,0);
});
