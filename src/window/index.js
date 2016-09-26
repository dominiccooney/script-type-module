import { hasNativeSupport } from './utils.js';
import {
  encode,
  decode,
  listen,
  send
} from '../msg.js';
import addModuleTools from './module-tools.js';
import spawn from './spawn.js';
import { ModuleScript } from './modules.js';
import { importExisting, observe } from './dom.js';
import Registry from './registry.js';

if(!hasNativeSupport()) {
  let worker = spawn();

  let registry = new Registry();
  let forEach = Array.prototype.forEach;
  let anonCount = 0;

  addModuleTools(registry);

  let filter = listen(worker);

  function importScript(script) {
    let url = "" + (script.src || new URL('./!anonymous_' + anonCount++, document.baseURI));
    let src = script.src ? undefined : script.textContent;

    // TODO what about inline modules
    return importModule(url, src)
    .then(function(){
      var ev = new Event('load');
      script.dispatchEvent(ev);
    })
    .then(null, function(err){
      console.error(err);
    });
  }

  function importModule(url, src) {
    var value = registry.moduleMap.get(url);
    var promise;
    if(value === "fetching") {
      promise = registry.importPromises.get(url);
    } else if(typeof value === "object") {
      promise = Promise.resolve(value);
    } else {
      promise = new Promise(function(resolve, reject){
        let moduleScript = new ModuleScript(url, resolve, reject);
        send(worker, {
          type: 'fetch',
          url: url,
          src: src
        });
        registry.add(moduleScript);
        filter(function(msg){
          if(msg.type === 'fetch' && msg.url === url) {
            handleFetch(msg, moduleScript);
            return true;
          }
        });
      });
      registry.importPromises.set(url, promise);
    }
    return promise;
  }

  function handleFetch(msg, moduleScript){
    let src = moduleScript.code = msg.src;
    let deps = msg.deps;

    Promise.all(deps.map(function(url){
      return importModule(url);
    }))
    .then(function(){
      registry.link(moduleScript, msg);
    }, moduleScript.reject);
  }

  importExisting(importScript);
  observe(importScript);
}