'use strict';

async function runRuntimeSelfTest({task}={}){
  const mode=String(task?.input?.mode||'pass');
  const holdMs=Math.max(0,Math.min(60000,Number(task?.input?.hold_ms||0)));
  if(holdMs)await new Promise(resolve=>setTimeout(resolve,holdMs));
  const base={schema:'runtime.self_test.v1',mode,attempt:Number(task?.attempts||0),hold_ms:holdMs,writes_attempted:0,spend_attempted:0};
  if(mode==='retry_once'&&Number(task?.attempts)===1)return {validated:false,correctable:true,evidence:base};
  if(!['pass','retry_once','hold'].includes(mode))return {validated:false,correctable:false,evidence:{...base,mode:'invalid'}};
  return {validated:true,evidence:base};
}
module.exports={runRuntimeSelfTest};
