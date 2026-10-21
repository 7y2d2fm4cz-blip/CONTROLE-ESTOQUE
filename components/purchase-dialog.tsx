'use client';
import {useEffect,useId,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';

export default function PurchaseDialog({title,busy,error,onClose,children}:{title:string;busy:boolean;error?:string;onClose:()=>void;children:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null);const titleId=useId();
 useEffect(()=>{const element=dialog.current;const previousOverflow=document.body.style.overflow;element?.showModal();document.body.style.overflow='hidden';return ()=>{element?.close();document.body.style.overflow=previousOverflow;};},[]);
 return <dialog ref={dialog} className="dialog wide purchaseModal" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();if(!busy)onClose();}}><div className="dialogHead"><div><span className="eyebrow">REQUISIÇÃO DE COMPRA</span><h2 id={titleId}>{title}</h2></div><button type="button" aria-label="Fechar requisição de compra" disabled={busy} onClick={onClose}><X size={21}/></button></div>{error&&<div className="alert error" role="alert">{error}</div>}{children}</dialog>;
}
