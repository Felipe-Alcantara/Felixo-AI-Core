# 🔐 GUIA-SISTEMAS-DE-CRIPTOGRAFIA-REUTILIZAVEIS-DA-CIFRA-DE-CESAR-EM-PYTHON.md

Status: concluido.

> **O que é**: Um guia reutilizável para estruturar sistemas de **cifra tradicional**, **cifra numérica**, **normalização de acentos** e **interface web interativa** baseados na Cifra de César.
>
> **De onde vem**: Este padrão foi extraído do projeto **Cifra de César em Python**.
>
> **Qual é o propósito dentro de `Utils/`**: Registrar os subsistemas técnicos reaproveitáveis do projeto como blocos prontos para uso em outros produtos educacionais, ferramentas de codificação e interfaces web leves.
>
> **Quando usar**: Apps de aprendizado de criptografia, mini-backends de transformação de texto, exercícios de segurança básica, demos web com Python no navegador e ferramentas de encode/decode para uso interno.
>
> **Origem da implementação**: Os caminhos citados abaixo pertencem ao repositório original e são usados aqui como rastreabilidade técnica.
>
> **Leitura correta deste documento**: Isto não é uma spec hipotética; é a consolidação de sistemas reais já implementados e testados em uso prático.

Este documento isola os sistemas que mais agregam reuso no projeto de origem, separando domínio de criptografia, contrato de transformação, normalização textual e camada de interface.

---

## 1. Origem, Contexto e Escopo de Reuso

### 1.1 Fontes principais da implementação de origem

- `src/cifra_tradicional/cifra_cesar_completa.py`
- `src/cifra_tradicional/decodificador_cifra_tradicional.py`
- `src/cifra_numerica/codificador_decodificador_numerico.py`
- `src/cifra_numerica/decodificador_mensagem_numerica.py`
- `src/ferramentas/utils_normalizacao.py`
- `src/ferramentas/deslocamento_alfabeto_interativo.py`
- `docs/index.html`

### 1.2 Sistemas extraídos para reuso

1. **Sistema de cifra tradicional** (texto -> texto cifrado -> texto original).
2. **Sistema de cifra numérica** (texto -> lista numérica -> texto original).
3. **Sistema de normalização de acentos** (compatibilidade com alfabeto base `a-z`).
4. **Sistema de interface web integrada** com múltiplas ferramentas na mesma tela.

### 1.3 O que pode ser reaproveitado quase sem mudança

- Funções de deslocamento de alfabeto.
- Fluxo de cifrar/decifrar com chave.
- Contrato de codificação numérica com preservação de espaço, dígitos e pontuação.
- Normalização de texto acentuado para base latina simples.
- Estrutura de UI por abas para cifrar/decifrar/codificar/decodificar/consultar.

---

## 2. Sistema 1: Cifra Tradicional Reutilizável

### 2.1 Papel

Realiza substituição alfabética por deslocamento, mantendo espaços e pontuação.

### 2.2 Fluxo padrão

```text
mensagem
  -> normalizar_texto()
  -> deslocar_alfabeto(chave)
  -> mapear cada letra pelo alfabeto deslocado
  -> saída cifrada
```

### 2.3 Contratos úteis

- `deslocar_alfabeto(deslocamento: int) -> str`
- `cifrar_mensagem(mensagem: str, alfabeto_deslocado: str) -> str`
- `decifrar_mensagem(mensagem_cifrada: str, alfabeto_deslocado: str) -> str`

### 2.4 Quando aplicar

- Exercícios de criptografia clássica.
- Jogos com mensagens secretas.
- Módulos introdutórios de segurança da informação.

---

## 3. Sistema 2: Cifra Numérica Reutilizável

### 3.1 Papel

Converte texto em sequência numérica com alfabeto deslocado e consegue reconstruir a mensagem original.

### 3.2 Contrato de codificação observado

| Tipo de entrada | Saída |
|---|---|
| Letras | `1..26` (conforme alfabeto deslocado) |
| Espaço | `0` |
| Dígitos | `-0` até `-9` (string) |
| Símbolos/pontuação | `-(100 + ord(char))` (string) |

### 3.3 Fluxo padrão

```text
texto
  -> normalizar_texto()
  -> criar_ordem_personalizada(chave)
  -> conversao()
  -> lista mista (int + string)

lista mista + chave
  -> criar_alfabeto_deslocado(chave)
  -> criar_mapeamento_inverso()
  -> decodificar_numeros()
  -> texto original
```

### 3.4 Valor de reuso

- Boa base para protocolos simples de troca de mensagens.
- Mantém fidelidade de formatação (espaços, números e símbolos).
- Facilita debug por exibir conversão item a item.

---

## 4. Sistema 3: Normalização de Acentos Reutilizável

### 4.1 Papel

Garante compatibilidade entre entrada em português/espanhol e algoritmos baseados em `a-z`.

### 4.2 Contratos

- `normalizar_texto(texto: str) -> str`
- `mostrar_conversoes(texto_original: str) -> tuple[str, list[str]]`

### 4.3 Mapa principal coberto

- Vogais acentuadas (`á`, `à`, `ã`, `â`, `ä`, etc.) -> vogais base.
- `ç` -> `c`
- `ñ` -> `n`
- Entrada convertida para minúsculas.

### 4.4 Uso recomendado

- Sempre aplicar antes de cifrar/decifrar quando o algoritmo depender de alfabeto latino simples.
- Mostrar feedback de conversão para transparência com usuário final.

---

## 5. Sistema 4: Interface Web Integrada (Brython)

### 5.1 Papel

Entrega as funcionalidades principais em uma única interface por abas:

1. Cifrar tradicional
2. Decifrar tradicional
3. Codificar numérico
4. Decodificar numérico
5. Consultar alfabeto deslocado

### 5.2 Características arquiteturais

- Página única (`docs/index.html`) com HTML/CSS/Brython.
- Lógica de criptografia executada no navegador.
- Feedback imediato de validação e resultados.
- Suporte a tema claro/escuro e uso responsivo.

### 5.3 Quando reaproveitar

- Prototipagem de ferramentas educacionais.
- Demos sem dependência de backend.
- Produtos que precisem de laboratório interativo de texto.

---

## 6. Blueprint de extração para outros projetos

```text
src/
  crypto/
    caesar.py
    numeric_codec.py
  text/
    normalization.py
  ui/
    web_playground/
tests/
  unit/
  integration/
```

Separação recomendada:

- `crypto/`: regras de domínio (puras).
- `text/`: transformação e saneamento de entrada.
- `ui/`: camada de interação (CLI/web).

---

## 7. Riscos e limites do padrão

1. Cifra de César é fraca para segurança real (poucas chaves possíveis).
2. Normalização remove acento de forma irreversível.
3. Duplicação de lógica entre módulos pode surgir se não houver extração para funções compartilhadas.

Para uso real com dados sensíveis, tratar este sistema como educacional e combinar com criptografia moderna.

---

## 8. Resumo Executivo

Os sistemas da **Cifra de César em Python** formam um pacote reaproveitável com quatro blocos claros: cifra tradicional, cifra numérica, normalização de acentos e interface web integrada. Em conjunto, eles servem como referência sólida para construir ferramentas educacionais de criptografia, playgrounds web e utilitários de transformação textual com boa experiência de uso e baixo custo de adoção.

---

> **Assinatura de Origem**  
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositório **Felixo System Design**.  
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design  
> Data desta versão: 2026-04-11  
> Sugestões e pull requests são bem-vindos.
