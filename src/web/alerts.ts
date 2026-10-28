// Avisos: som e notificação do navegador para mensagem nova, e total de não lidas no título da aba.
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { shouldAlert } from "../shared/alerts";
import { api } from "./api";
import { authClient } from "./auth-client";
import { contactLabel, messagePreview } from "./format";
import { onRealtime } from "./realtime";

const BASE_TITLE = "CRM WhatsApp";

let audio: AudioContext | null = null;

/** Criado no primeiro clique: o navegador só libera som depois de um gesto do usuário. */
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    // Sem WebAudio: fica só a notificação.
  }
}

function beep() {
  if (!audio) return;
  try {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.4);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.4);
  } catch {
    // Som é conforto; nunca deve quebrar a tela.
  }
}

const tabInBackground = () => document.hidden || !document.hasFocus();

/** Monte uma vez, na área logada. */
export function useAlerts() {
  const navigate = useNavigate();
  const { data } = authClient.useSession();
  const me = data?.user.id;

  // Permissão de notificação e som pedem um gesto: no primeiro toque/clique.
  useEffect(() => {
    const onGesture = () => {
      unlockAudio();
      if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    };
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, []);

  useEffect(() => {
    if (!me) return;
    return onRealtime((event) => {
      if (event.type !== "message.created" || !shouldAlert(event, me) || !tabInBackground()) return;
      beep();
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      const { conversation, message } = event;
      const n = new Notification(contactLabel(conversation.contact), {
        body: messagePreview(message.type, message.text),
        tag: conversation.id, // várias mensagens da mesma conversa substituem a anterior
      });
      n.onclick = () => {
        window.focus();
        navigate(`/conversas/${conversation.id}`);
        n.close();
      };
    });
  }, [me, navigate]);

  // Título da aba: soma das não lidas de todas as conversas (a lista da API não é paginada).
  useEffect(() => {
    const unread = new Map<string, number>();
    const render = () => {
      let total = 0;
      for (const n of unread.values()) total += n;
      document.title = total > 0 ? `(${total > 99 ? "99+" : total}) ${BASE_TITLE}` : BASE_TITLE;
    };
    let alive = true;
    const load = () =>
      api
        .conversations()
        .then((r) => {
          if (!alive) return;
          unread.clear();
          for (const c of r.conversations) unread.set(c.id, c.unreadCount);
          render();
        })
        .catch(() => undefined);
    void load();
    const off = onRealtime((event) => {
      if (event.type === "reconnected") return void load();
      if (event.type !== "message.created" && event.type !== "conversation.updated") return;
      unread.set(event.conversation.id, event.conversation.unreadCount);
      render();
    });
    return () => {
      alive = false;
      off();
      document.title = BASE_TITLE;
    };
  }, []);
}
