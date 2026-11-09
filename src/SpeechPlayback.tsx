import {useEffect,useRef,useState} from 'react';
import {DeviceVoice} from './DeviceVoice';
import {ControlIcon} from './ControlIcon';
import {playLine} from './voice-output';
export function SpeechPlayback({sessionId,messageIndex,disabled,text,opening}:{
  sessionId:string;messageIndex:number;disabled:boolean;text:string;opening?:string;
}){
  const [state,setState]=useState<'idle'|'busy'|'error'>('idle'), [device,setDevice]=useState(false);
  const current=useRef<AbortController|null>(null);
  function stop(){current.current?.abort();current.current=null;}
  async function play(manual=false){
    stop();const c=new AbortController();current.current=c;setState('busy');
    try {await playLine(opening,sessionId,messageIndex,c.signal,()=>{},manual);if(current.current===c && !c.signal.aborted)setState('idle');}
    catch(e){if(current.current===c && !c.signal.aborted)setState(e instanceof DOMException && e.name==='NotAllowedError'?'idle':'error');}
  }
  useEffect(()=>{const t=!disabled&&!device?setTimeout(()=>void play(),0):undefined;return()=>{clearTimeout(t);stop();};},[sessionId,messageIndex,opening,disabled,device]);
  if(device)return <DeviceVoice text={text} enabled disabled={disabled}/>;
  const label=state==='busy'?'読み上げを停止':'相手の言葉を読み上げる';
  return <div className="speech-playback"><button type="button" aria-label={label} data-tip={label} disabled={disabled} onClick={()=>{
    if(state==='busy'){stop();setState('idle');}else{void play(true);}
  }}><ControlIcon name={state==='busy'?'stop':'play'}/></button>
  {state==='error'&&<><span className="sr-only" role="status">音声を再生できませんでした。字幕で続けるか、端末の声で聞くボタンを利用できます。</span><button type="button" aria-label="端末の声で聞く" data-tip="端末の声で聞く" onClick={()=>setDevice(true)}><ControlIcon name="device"/></button></>}</div>;
}
