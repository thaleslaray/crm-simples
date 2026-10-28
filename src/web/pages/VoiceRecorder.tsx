import { useEffect, useRef, useState } from "react";

// Primeiro formato que o navegador grava: ogg/opus é o ideal para o WhatsApp; Chrome grava webm/opus e Safari mp4.
const FORMATS: { mime: string; ext: string }[] = [
  { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  { mime: "audio/webm;codecs=opus", ext: "webm" },
  { mime: "audio/mp4", ext: "m4a" },
];

type Phase = { kind: "starting" } | { kind: "recording" } | { kind: "recorded"; file: File; url: string } | { kind: "denied" };

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * Grava uma nota de voz no navegador: começa ao abrir, para no botão, deixa ouvir e então envia ou descarta.
 * Quem usa decide o que fazer com o arquivo (`onSend`) e ao descartar (`onCancel`).
 */
export function VoiceRecorder({ onSend, onCancel, busy }: { onSend: (file: File) => void; onCancel: () => void; busy: boolean }) {
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  // Descartar durante a gravação não pode virar "gravado": a parada sem envio só solta o microfone.
  const discarded = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    discarded.current = false; // StrictMode monta duas vezes: a limpeza da primeira não vale para a segunda
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const format = FORMATS.find((f) => MediaRecorder.isTypeSupported(f.mime));
        const rec = new MediaRecorder(stream, format ? { mimeType: format.mime } : undefined);
        const chunks: Blob[] = [];
        rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
        rec.onstop = () => {
          stream?.getTracks().forEach((t) => t.stop());
          clearInterval(timer);
          if (discarded.current) return;
          const mime = rec.mimeType || format?.mime || "audio/webm";
          const ext = FORMATS.find((f) => mime.startsWith(f.mime.split(";")[0]!))?.ext ?? "webm";
          const file = new File(chunks, `nota-de-voz.${ext}`, { type: mime });
          setPhase({ kind: "recorded", file, url: URL.createObjectURL(file) });
        };
        recorder.current = rec;
        rec.start();
        timer = setInterval(() => setSeconds((s) => s + 1), 1000);
        setPhase({ kind: "recording" });
      } catch {
        if (!cancelled) setPhase({ kind: "denied" });
      }
    })();
    return () => {
      cancelled = true;
      discarded.current = true;
      clearInterval(timer);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Libera a URL da prévia ao trocar de fase ou sair.
  useEffect(() => {
    if (phase.kind !== "recorded") return;
    return () => URL.revokeObjectURL(phase.url);
  }, [phase]);

  if (phase.kind === "denied")
    return (
      <div className="voice" role="alert">
        <span>Sem acesso ao microfone. Libere o microfone no navegador e tente de novo.</span>
        <button type="button" className="secondary" onClick={onCancel}>
          Fechar
        </button>
      </div>
    );

  return (
    <div className="voice">
      {phase.kind === "recorded" ? (
        <audio className="voice-preview" src={phase.url} controls aria-label="Prévia da nota de voz" />
      ) : (
        <span className="voice-live" role="status">
          <span className="voice-dot" aria-hidden="true" />
          {phase.kind === "starting" ? "Abrindo o microfone…" : `Gravando ${clock(seconds)}`}
        </span>
      )}
      <div className="voice-actions">
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          Descartar
        </button>
        {phase.kind === "recording" && (
          <button type="button" onClick={() => recorder.current?.stop()}>
            Parar
          </button>
        )}
        {phase.kind === "recorded" && (
          <button type="button" onClick={() => onSend(phase.file)} disabled={busy}>
            Enviar nota de voz
          </button>
        )}
      </div>
    </div>
  );
}
