import { Camera, FileText, Image, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Botão "+" do campo de mensagem: menu com fotos e vídeos, documento e câmera. Devolve o arquivo escolhido. */
export function AttachMenu({ onPick }: { onPick: (file: File) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const media = useRef<HTMLInputElement>(null);
  const doc = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (input: React.RefObject<HTMLInputElement | null>) => {
    setOpen(false);
    input.current?.click();
  };
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onPick(file);
  };

  return (
    <div className="attach-wrap" ref={wrap}>
      <button type="button" className="composer-btn" aria-label="Anexar" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Plus aria-hidden="true" />
      </button>
      {open && (
        <div className="attach-menu" role="menu" aria-label="Anexar">
          <button type="button" role="menuitem" onClick={() => choose(media)}>
            <Image aria-hidden="true" />
            Fotos e vídeos
          </button>
          <button type="button" role="menuitem" onClick={() => choose(doc)}>
            <FileText aria-hidden="true" />
            Documento
          </button>
          <button type="button" role="menuitem" onClick={() => choose(camera)}>
            <Camera aria-hidden="true" />
            Câmera
          </button>
        </div>
      )}
      <input ref={media} type="file" hidden accept="image/*,video/*" onChange={onChange} />
      <input ref={doc} type="file" hidden onChange={onChange} />
      <input ref={camera} type="file" hidden accept="image/*" capture="environment" onChange={onChange} />
    </div>
  );
}
