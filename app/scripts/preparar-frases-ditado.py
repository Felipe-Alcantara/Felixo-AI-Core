"""Baixa as frases humanas de frases-ditado.json e monta os pares NN.wav + NN.txt
que o medir-transcricao-nuvem.cjs lê. O áudio não é versionado.

Fontes: FLEURS pt_br (google/fleurs, CC-BY 4.0) e VoxForge pt (GPL). Só dados
públicos; nenhuma chave entra aqui.

Uso: python preparar-frases-ditado.py <pasta-de-saida>   (só biblioteca padrão)
"""
import io
import json
import sys
import tarfile
import urllib.request
from pathlib import Path

FLEURS = "https://huggingface.co/datasets/google/fleurs/resolve/main/data/pt_br/audio/dev.tar.gz"
VOXFORGE = "https://repository.voxforge1.org/downloads/pt/Trunk/Audio/Main/16kHz_16bit/"


def baixar_fleurs(nomes):
    """Lê o pacote em fluxo e para quando achar todas (o pacote tem ~250 MB)."""
    achados = {}
    with urllib.request.urlopen(FLEURS, timeout=120) as resposta, tarfile.open(fileobj=resposta, mode="r|gz") as tar:
        for membro in tar:
            nome = membro.name.rsplit("/", 1)[-1]
            if nome in nomes and membro.isfile():
                achados[nome] = tar.extractfile(membro).read()
                if len(achados) == len(nomes):
                    break
    return achados


def baixar_voxforge(ids):
    achados = {}
    for pacote in sorted({i.split(":")[0] for i in ids}):
        with urllib.request.urlopen(VOXFORGE + pacote, timeout=120) as resposta:
            dados = resposta.read()
        with tarfile.open(fileobj=io.BytesIO(dados), mode="r:gz") as tar:
            for membro in tar.getmembers():
                chave = f"{pacote}:{membro.name.split('/', 1)[-1]}"
                if chave in ids and membro.isfile():
                    achados[chave] = tar.extractfile(membro).read()
    return achados


def main(saida):
    manifesto = json.loads(Path(__file__).with_name("frases-ditado.json").read_text(encoding="utf-8"))
    por_fonte = lambda fonte: {item["id"] for item in manifesto if item["fonte"] == fonte}
    audios = {**baixar_fleurs(por_fonte("fleurs")), **baixar_voxforge(por_fonte("voxforge"))}
    faltam = [item["id"] for item in manifesto if item["id"] not in audios]
    if faltam:
        sys.exit(f"não encontrei: {', '.join(faltam)}")
    pasta = Path(saida)
    pasta.mkdir(parents=True, exist_ok=True)
    # Nomes de saída são nossos (01, 02...): nada do pacote vira caminho no disco.
    for numero, item in enumerate(manifesto, 1):
        (pasta / f"{numero:02}.wav").write_bytes(audios[item["id"]])
        (pasta / f"{numero:02}.txt").write_text(item["transcricao"] + "\n", encoding="utf-8")
    print(f"{len(manifesto)} pares em {pasta}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Uso: python preparar-frases-ditado.py <pasta-de-saida>")
    main(sys.argv[1])
