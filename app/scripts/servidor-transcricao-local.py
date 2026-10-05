"""Servidor local de transcrição, compatível com POST /v1/audio/transcriptions da OpenAI.

Serve para usar o ditado por voz do Felixo AI Core sem chave e sem mandar o
áudio para fora (Configurações → Ditado por voz → Servidor local, endereço
http://127.0.0.1:8765/v1), e para validar o ditado (scripts/validar-ditado-linux.cjs).

Só escuta em 127.0.0.1. O campo `model` escolhe o tamanho do faster-whisper
(tiny/base/small/...); `whisper-1` (padrão do app) vira o modelo de --padrao.
Cada pedido é registrado em JSONL com o tempo medido.

Dependências (numa venv): pip install faster-whisper "av<16"
(o faster-whisper 1.2.1 ainda chama um argumento que o PyAV 16+ removeu).
"""
import argparse
import email.parser
import email.policy
import io
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from faster_whisper import WhisperModel

MODELOS = {}


def modelo(nome):
    if nome not in MODELOS:
        MODELOS[nome] = WhisperModel(nome, device="cpu", compute_type="int8")
    return MODELOS[nome]


def ler_multipart(cabecalho, corpo):
    msg = email.parser.BytesParser(policy=email.policy.default).parsebytes(
        b"Content-Type: " + cabecalho.encode() + b"\r\n\r\n" + corpo
    )
    campos, arquivo = {}, None
    for parte in msg.iter_parts():
        nome = parte.get_param("name", header="content-disposition")
        if parte.get_filename():
            arquivo = (parte.get_filename(), parte.get_content_type(), parte.get_payload(decode=True))
        else:
            campos[nome] = parte.get_content().strip()
    return campos, arquivo


class Handler(BaseHTTPRequestHandler):
    def responder(self, codigo, dados):
        corpo = json.dumps(dados, ensure_ascii=False).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_POST(self):
        tamanho = int(self.headers.get("Content-Length", "0"))
        corpo = self.rfile.read(tamanho)  # lê sempre: responder antes derruba a conexão
        if self.path.rstrip("/") != "/v1/audio/transcriptions":
            return self.responder(404, {"error": {"message": "rota inexistente"}})
        campos, arquivo = ler_multipart(self.headers["Content-Type"], corpo)
        if not arquivo:
            return self.responder(400, {"error": {"message": "sem arquivo"}})
        nome = campos.get("model") or "whisper-1"
        nome = self.server.padrao if nome == "whisper-1" else nome
        inicio = time.monotonic()
        segmentos, info = modelo(nome).transcribe(
            io.BytesIO(arquivo[2]), language=campos.get("language") or None, beam_size=1
        )
        texto = " ".join(s.text.strip() for s in segmentos).strip()
        decorrido = time.monotonic() - inicio
        with open(self.server.registro, "a", encoding="utf-8") as saida:
            saida.write(json.dumps({
                "quando": time.strftime("%H:%M:%S"), "modelo": nome, "tipo": arquivo[1],
                "nome": arquivo[0], "bytes": len(arquivo[2]), "audio_s": round(info.duration, 2),
                "transcricao_s": round(decorrido, 2), "texto": texto,
            }, ensure_ascii=False) + "\n")
        self.responder(200, {"text": texto})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--porta", type=int, default=8765)
    p.add_argument("--padrao", default="small")
    p.add_argument("--registro", required=True)
    a = p.parse_args()
    servidor = ThreadingHTTPServer(("127.0.0.1", a.porta), Handler)
    servidor.padrao, servidor.registro = a.padrao, a.registro
    modelo(a.padrao)  # carrega antes do primeiro pedido
    print(f"ouvindo em http://127.0.0.1:{a.porta}/v1 (padrão {a.padrao})", flush=True)
    servidor.serve_forever()
