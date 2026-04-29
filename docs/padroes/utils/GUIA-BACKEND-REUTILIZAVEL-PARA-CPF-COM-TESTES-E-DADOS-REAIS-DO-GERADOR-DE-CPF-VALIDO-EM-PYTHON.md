# 🪪 GUIA-BACKEND-REUTILIZAVEL-PARA-CPF-COM-TESTES-E-DADOS-REAIS-DO-GERADOR-DE-CPF-VALIDO-EM-PYTHON.md

> **O que é**: Um guia reutilizável para estruturar um backend pequeno, testável e seguro para **geração, validação e normalização de CPF**.
>
> **De onde vem**: Este padrão foi extraído da implementação Python do projeto **Gerador de CPF Válido em Python**.
>
> **Qual é o propósito dentro de `Utils/`**: Registrar essa lógica como um bloco backend reaproveitável do `Felixo System Design`, separando algoritmo, contratos, testes e guardrails de dados do produto original.
>
> **Quando usar**: APIs, formulários, scripts, automações, serviços internos ou fluxos de QA que precisem gerar, validar, sanitizar ou testar CPF com segurança.
>
> **Origem da implementação**: Os caminhos e módulos citados neste documento pertencem à estrutura do projeto original, fora deste repositório, e aparecem aqui apenas como rastreabilidade técnica.
>
> **Leitura correta deste documento**: Isto não é uma spec hipotética; é a consolidação de um backend lógico real que pode ser transportado para outros sistemas.

Este documento não tenta explicar todo o projeto original. O foco aqui é isolar o padrão de backend para CPF como um artefato reutilizável, deixando claro o que pode ser reaproveitado, adaptado, testado e protegido em outros contextos.

---

## 1. Origem, Contexto e Reuso

### 1.1 Origem do Documento

Este material foi extraído e consolidado a partir da implementação Python original do projeto **Gerador de CPF Válido em Python**, fora deste repositório. O conteúdo técnico veio principalmente dos seguintes arquivos na estrutura da implementação-base:

- `Versão no terminal/Gerador de CPF.py`
- `Versão no terminal/Gerador de CPF por Região.py`
- `Versão no terminal/Validador de CPF.py`

As referências a esses arquivos neste documento existem apenas para **rastreabilidade da origem**. Elas não indicam que esses caminhos existam dentro do `Felixo System Design`.

### 1.2 Contexto de Origem

O projeto-base não possui backend web, banco de dados nem API. Ainda assim, ele contém uma camada Python suficientemente clara para ser tratada como backend lógico, porque centraliza:

- regras de negócio;
- cálculo determinístico;
- validação de entrada;
- formatação de saída;
- contratos reutilizáveis de retorno.

### 1.3 O Que é Reutilizável em Outros Projetos

Os elementos abaixo podem ser copiados para outro projeto quase sem alteração:

- algoritmo de cálculo dos dígitos verificadores;
- regra do 9º dígito para região fiscal;
- limpeza e validação do CPF;
- contrato de retorno de `validar_cpf()`;
- matriz de testes automatizados;
- guardrails para uso de dados reais.

### 1.4 O Que Deve Ser Adaptado em Outro Projeto

Os elementos abaixo pertencem ao contexto da implementação-base e devem ser renomeados ou adaptados:

- nomes de arquivos e módulos;
- funções de `print()` e `input()`;
- formato de logs;
- estratégia de persistência;
- integração com API, fila, formulário ou banco;
- política de tratamento de dados sensíveis.

### 1.5 Estrutura Sugerida para Uso Externo

Ao reaproveitar este padrão em outro projeto, a organização recomendada é:

```text
src/
  domain/
    cpf_rules.py
  services/
    cpf_generator.py
    cpf_validator.py
  contracts/
    cpf_result.py
tests/
  unit/
  integration/
  contract/
```

### 1.6 Como Ler Este Documento

- As seções conceituais são genéricas e podem ser reutilizadas diretamente.
- As seções com nomes de arquivo representam a **implementação de origem**.
- O ideal é copiar este documento para outro projeto e trocar apenas o mapeamento da implementação.

---

## 2. Visão Geral da Camada Python

### 2.1 Arquivos da Implementação de Origem

| Arquivo | Papel |
|---------|-------|
| `Versão no terminal/Gerador de CPF.py` | Geração aleatória de CPF válido |
| `Versão no terminal/Gerador de CPF por Região.py` | Geração de CPF válido com região fiscal controlada |
| `Versão no terminal/Validador de CPF.py` | Validação de CPF com ou sem formatação |

### 2.2 Arquitetura Lógica

```text
Entrada
  -> preparação dos dados
  -> cálculo dos dígitos verificadores
  -> identificação da região fiscal
  -> formatação ou validação
  -> saída textual
```

### 2.3 Tipos de Função

- **Puras**: cálculo, formatação, limpeza, mapa de regiões.
- **Randômicas**: geração de dígitos com `random.randint`.
- **Orquestradoras**: encadeiam o fluxo completo.
- **I/O**: `print()` e `input()`.

Essa divisão define a estratégia de testes:

- funções puras -> testes unitários;
- funções orquestradoras -> integração;
- funções de I/O -> testes com captura de entrada e saída.

---

## 3. Regras de Negócio do CPF

### 3.1 Estrutura

- O CPF final possui **11 dígitos**.
- Os **9 primeiros** são a base numérica.
- O **10º** e o **11º** são dígitos verificadores.
- O formato final usado no padrão é `XXX.XXX.XXX-XX`.

### 3.2 Primeiro Dígito Verificador

1. Multiplicar os 9 primeiros dígitos pelos pesos de `10` até `2`.
2. Somar os resultados.
3. Calcular `resto = soma % 11`.
4. Se `resto < 2`, o dígito é `0`.
5. Caso contrário, o dígito é `11 - resto`.

### 3.3 Segundo Dígito Verificador

1. Anexar o primeiro verificador aos 9 dígitos base.
2. Multiplicar os 10 valores pelos pesos de `11` até `2`.
3. Somar os resultados.
4. Calcular `resto = soma % 11`.
5. Se `resto < 2`, o dígito é `0`.
6. Caso contrário, o dígito é `11 - resto`.

### 3.4 Região Fiscal

O **9º dígito** identifica a região fiscal:

| Dígito | Região |
|--------|--------|
| `0` | RS |
| `1` | DF, GO, MT, MS, TO |
| `2` | AC, AM, AP, PA, RO, RR |
| `3` | CE, MA, PI |
| `4` | AL, PB, PE, RN |
| `5` | BA, SE |
| `6` | MG |
| `7` | ES, RJ |
| `8` | SP |
| `9` | PR, SC |

### 3.5 Regras de Validação

- Remover caracteres não numéricos antes de validar.
- Exigir exatamente 11 dígitos após limpeza.
- Rejeitar sequências repetidas, como `11111111111`.
- Recalcular os verificadores e comparar com os informados.

### 3.6 Invariantes para Testes

- Todo CPF formatado deve casar com `^\d{3}\.\d{3}\.\d{3}-\d{2}$`.
- O gerador por região deve manter a região escolhida no 9º dígito.
- `validar_cpf()` deve sempre retornar `(bool, dict)`.

---

## 4. Mapeamento da Implementação de Origem

Esta seção documenta a implementação-base de onde o padrão foi derivado. Em outro projeto, substitua os nomes de arquivo por seus módulos equivalentes, mas preserve os contratos e as regras de negócio.

## 4.1 `Versão no terminal/Gerador de CPF.py`

| Função | Tipo | Responsabilidade | Entrada -> Saída | Foco de teste |
|--------|------|------------------|------------------|---------------|
| `gerar_nove_digitos()` | Randômica | Gera os 9 dígitos base | `None -> list[int]` | tamanho `9`, valores `0-9` |
| `calcular_primeiro_digito(digitos)` | Pura | Calcula o 1º verificador | `list[int] -> int` | caso fixo `123456789 -> 0` |
| `calcular_segundo_digito(digitos, primeiro_digito)` | Pura | Calcula o 2º verificador | `list[int], int -> int` | caso fixo `123456789 + 0 -> 9` |
| `identificar_regiao_fiscal(digitos)` | Pura | Lê o 9º dígito e retorna a região | `list[int] -> tuple[int, str]` | `digitos[8]` coerente com o mapa |
| `formatar_cpf(digitos, digito1, digito2)` | Pura | Aplica a máscara do CPF | `list[int], int, int -> str` | `123456789,0,9 -> 123.456.789-09` |
| `exibir_mensagem_geracao(...)` | I/O | Mostra o processo completo no terminal | argumentos -> `None` | captura de `stdout` |
| `gerar_cpf_valido()` | Orquestradora | Executa o fluxo completo e retorna o CPF | `None -> str` | regex final e coerência interna |

### Fluxo do Módulo

```text
gerar_nove_digitos
  -> calcular_primeiro_digito
  -> calcular_segundo_digito
  -> formatar_cpf
  -> exibir_mensagem_geracao
```

## 4.2 `Versão no terminal/Gerador de CPF por Região.py`

| Função | Tipo | Responsabilidade | Entrada -> Saída | Foco de teste |
|--------|------|------------------|------------------|---------------|
| `obter_regioes_fiscais()` | Pura | Retorna o mapa oficial usado pelo projeto | `None -> dict[int, str]` | 10 chaves, de `0` a `9` |
| `exibir_menu_regioes()` | I/O | Exibe o menu de escolha da região | `None -> None` | captura de `stdout` |
| `solicitar_regiao()` | I/O | Valida a entrada interativa do usuário | `stdin -> int` | aceitar `0-9`, rejeitar texto e fora da faixa |
| `gerar_oito_digitos_aleatorios()` | Randômica | Gera os 8 dígitos livres | `None -> list[int]` | tamanho `8`, valores `0-9` |
| `gerar_nove_digitos_com_regiao(regiao_escolhida)` | Randômica | Fecha a base com o dígito da região | `int -> list[int]` | `digitos[8] == regiao_escolhida` |
| `calcular_primeiro_digito(digitos)` | Pura | Calcula o 1º verificador | `list[int] -> int` | mesmo contrato do gerador simples |
| `calcular_segundo_digito(digitos, primeiro_digito)` | Pura | Calcula o 2º verificador | `list[int], int -> int` | mesmo contrato do gerador simples |
| `formatar_cpf(digitos, digito1, digito2)` | Pura | Aplica a máscara | `list[int], int, int -> str` | regex final |
| `exibir_resultado(...)` | I/O | Mostra CPF, região e detalhes do cálculo | argumentos -> `None` | captura de `stdout` |
| `perguntar_gerar_novamente()` | I/O | Controla a repetição do fluxo | `stdin -> bool` | aceitar `S/SIM/Y/YES` e `N/NAO/NÃO/NO` |
| `gerar_cpf_por_regiao()` | Orquestradora | Coordena o fluxo interativo completo | `None -> None` | integração com `input()` simulado |

### Fluxo do Módulo

```text
obter_regioes_fiscais
  -> solicitar_regiao
  -> gerar_nove_digitos_com_regiao
  -> calcular_primeiro_digito
  -> calcular_segundo_digito
  -> formatar_cpf
  -> exibir_resultado
  -> perguntar_gerar_novamente
```

## 4.3 `Versão no terminal/Validador de CPF.py`

| Função | Tipo | Responsabilidade | Entrada -> Saída | Foco de teste |
|--------|------|------------------|------------------|---------------|
| `limpar_cpf(cpf)` | Pura | Remove tudo que não for número | `str -> str` | `123.456.789-09 -> 12345678909` |
| `validar_formato(cpf_limpo)` | Pura | Valida tamanho e repetição | `str -> tuple[bool, str]` | comprimento diferente de `11` e sequência repetida |
| `calcular_primeiro_digito(digitos)` | Pura | Recalcula o 1º verificador | `list[int] -> int` | caso fixo conhecido |
| `calcular_segundo_digito(digitos, primeiro_digito)` | Pura | Recalcula o 2º verificador | `list[int], int -> int` | caso fixo conhecido |
| `identificar_regiao_fiscal(digitos)` | Pura | Descobre a região pelo 9º dígito | `list[int] -> tuple[int, str]` | coerência com o mapa |
| `validar_cpf(cpf)` | Pura de alto nível | Coordena toda a validação | `str -> tuple[bool, dict]` | entrada limpa e mascarada devem gerar o mesmo resultado |
| `exibir_resultado(cpf_original, valido, informacoes)` | I/O | Exibe sucesso ou falha com explicação | argumentos -> `None` | captura de `stdout` |
| `solicitar_cpf()` | I/O | Lê o CPF digitado no terminal | `stdin -> str` | preservar o valor informado |
| `perguntar_validar_novamente()` | I/O | Controla repetição do fluxo | `stdin -> bool` | aceitar variantes de sim e não |
| `main()` | Orquestradora | Executa o ciclo completo do validador | `None -> None` | integração do fluxo completo |

### Contrato de Retorno de `validar_cpf(cpf)`

Formato fixo:

```python
(bool, dict)
```

Casos esperados:

```python
False, {"erro": "..."}  # erro de formato

False, {
    "erro": "Dígitos verificadores inválidos",
    "verificadores_informados": "00",
    "verificadores_corretos": "09"
}

True, {
    "cpf_formatado": "123.456.789-09",
    "nove_primeiros": "1 2 3 4 5 6 7 8 9",
    "primeiro_verificador": 0,
    "segundo_verificador": 9,
    "nono_digito": 9,
    "regiao_fiscal": "PR, SC (Paraná, Santa Catarina)"
}
```

### Fluxo do Módulo

```text
solicitar_cpf
  -> limpar_cpf
  -> validar_formato
  -> calcular_primeiro_digito
  -> calcular_segundo_digito
  -> comparar verificadores
  -> identificar_regiao_fiscal
  -> exibir_resultado
```

---

## 5. Contratos de Dados do Backend

### 5.1 Mapa de Regiões

O mapa de regiões é uma dependência central do projeto e aparece em mais de um arquivo. Para fins de System Design, ele deve ser tratado como **contrato de domínio**.

### 5.2 CPF Formatado

Toda saída formatada precisa respeitar:

```text
XXX.XXX.XXX-XX
```

### 5.3 Retorno do Validador

O retorno de `validar_cpf()` deve ser usado como contrato para:

- testes automatizados;
- futuras APIs;
- formulários que usem essa lógica no backend;
- logs e observabilidade.

---

## 6. Fluxos de Backend

## 6.1 Geração Aleatória

1. Gerar 9 dígitos.
2. Calcular o primeiro verificador.
3. Calcular o segundo verificador.
4. Formatar o CPF.
5. Identificar a região fiscal.
6. Exibir e retornar o resultado.

## 6.2 Geração por Região

1. Ler a região escolhida.
2. Gerar 8 dígitos aleatórios.
3. Fixar o 9º dígito com a região.
4. Calcular os verificadores.
5. Formatar o CPF.
6. Exibir o resultado.

## 6.3 Validação

1. Ler a entrada.
2. Limpar a formatação.
3. Validar tamanho e repetição.
4. Recalcular verificadores.
5. Comparar com os informados.
6. Retornar sucesso ou falha estruturada.

---

## 7. Padrão Reutilizável de Testes Automatizados

### 7.1 Pirâmide Recomendada

| Camada | O que validar |
|--------|---------------|
| **Unitário** | cálculo, formatação, limpeza, mapa de regiões |
| **Contrato** | formato do retorno de `validar_cpf()` |
| **Integração** | fluxo completo dos geradores e do validador |
| **I/O** | mensagens e interação com `input()` e `print()` |

### 7.2 Template de Caso de Teste

```markdown
ID:
Função ou fluxo:
Tipo de teste:
Entrada:
Ação:
Saída esperada:
Regra validada:
```

### 7.3 Casos Base Reutilizáveis

| ID | Alvo | Cenário | Resultado esperado |
|----|------|---------|-------------------|
| `UT-01` | `gerar_nove_digitos()` | geração básica | lista com 9 inteiros entre `0` e `9` |
| `UT-02` | `gerar_nove_digitos_com_regiao(8)` | região fixa | 9º dígito igual a `8` |
| `UT-03` | `calcular_primeiro_digito()` | base `123456789` | retorno `0` |
| `UT-04` | `calcular_segundo_digito()` | base `123456789` + `0` | retorno `9` |
| `UT-05` | `formatar_cpf()` | máscara | `123.456.789-09` |
| `UT-06` | `limpar_cpf()` | entrada com pontuação | somente números |
| `UT-07` | `validar_formato()` | CPF curto | inválido |
| `UT-08` | `validar_formato()` | sequência repetida | inválido |
| `CT-01` | `validar_cpf()` | CPF válido | `(True, dict)` com chaves obrigatórias |
| `CT-02` | `validar_cpf()` | dígitos verificadores errados | `(False, dict)` com comparativo |
| `IT-01` | `gerar_cpf_valido()` | fluxo completo | string final formatada |
| `IT-02` | `validar_cpf("123.456.789-09")` | entrada mascarada | mesmo resultado da entrada limpa |

### 7.4 Exemplo de Teste Unitário

```python
def test_formatar_cpf():
    digitos = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    assert formatar_cpf(digitos, 0, 9) == "123.456.789-09"
```

### 7.5 Exemplo de Assert Estrutural para Aleatoriedade

```python
assert len(digitos) == 9
assert all(0 <= d <= 9 for d in digitos)
assert re.match(r"^\d{3}\.\d{3}\.\d{3}-\d{2}$", cpf)
```

---

## 8. Uso de Casos Reais e Prevenção com Dados Reais

### 8.1 Casos Reais que Devem Virar Cenários de Teste

Use casos inspirados em operação real, mas sem expor CPF verdadeiro no repositório:

| Categoria | Exemplo de entrada | Uso em teste |
|-----------|--------------------|--------------|
| **Entrada mascarada** | `123.456.789-09` | validar limpeza e equivalência com entrada limpa |
| **Entrada sem máscara** | `12345678909` | validar fluxo bruto |
| **Entrada com espaços** | `123 456 789 09` | validar normalização |
| **Entrada colada com ruído** | `CPF: 123.456.789-09` | validar remoção de caracteres extras |
| **Erro de digitação** | `123.456.789-00` | validar divergência de dígitos verificadores |
| **Tamanho incorreto** | `1234567890` | validar rejeição por comprimento |
| **Sequência repetida** | `11111111111` | validar bloqueio de caso artificial comum |
| **Zeros à esquerda** | base iniciando em `0` | garantir que a lógica não perca posição |

### 8.2 Regra para Uso de Dados Reais

Para testes e prevenção, a ordem correta é:

1. **Preferir dados sintéticos** gerados pelo próprio sistema.
2. Quando precisar de comportamento realista, usar **casos reais sanitizados**.
3. Só usar dado real identificável quando houver necessidade formal, controle de acesso e base legal adequada.

### 8.3 Guardrails para Dados Reais

- Nunca commitar CPF real em `fixtures`, `README`, documentação ou logs.
- Nunca exibir CPF real completo em mensagem de erro, print de monitoramento ou screenshot compartilhado.
- Preferir mascaramento, como `***.***.***-09`, em ambientes não produtivos.
- Se um caso real precisar ser preservado para análise, tokenizar ou hashear antes de armazenar.
- Limitar acesso a massas sensíveis por perfil e ambiente.
- Definir retenção curta para amostras operacionais.
- Seguir a LGPD e a política interna de dados da aplicação que consumir essa lógica.

### 8.4 Prevenção Operacional para Sistemas que Reutilizarem Este Backend

Se esta lógica for colocada atrás de uma API, fila ou formulário real, recomenda-se:

- validar e normalizar o CPF na entrada do backend;
- mascarar CPF em logs;
- armazenar somente quando houver necessidade real de negócio;
- separar massa de produção e massa de homologação;
- criar alertas para excesso de tentativas inválidas;
- registrar métricas agregadas, não documentos completos;
- revisar permissões de quem pode consultar ou exportar dados.

### 8.5 Padrão Reutilizável

```text
caso real observado
  -> sanitização
  -> transformação em cenário de teste
  -> execução automatizada
  -> prevenção de vazamento em logs, fixtures e documentação
```

---

## 9. Riscos e Oportunidades Técnicas

1. **Lógica duplicada**
   - O cálculo do CPF está replicado em vários arquivos.
   - A recomendação é extrair um módulo compartilhado, como `core/cpf.py`.

2. **Gerador vs. validador**
   - O gerador não bloqueia, explicitamente, sequências repetidas.
   - O validador rejeita esse caso.
   - Isso deve entrar como observação de robustez em testes futuros.

3. **Reuso em sites e formulários**
   - O backend atual já está pronto para virar serviço, função compartilhada ou biblioteca interna.
   - O contrato mais importante para esse reuso é `validar_cpf(cpf) -> (bool, dict)`.

---

## 10. Resumo Executivo

Este backend é pequeno, mas já contém um padrão completo de domínio:

- geração de dados;
- cálculo determinístico;
- validação estruturada;
- identificação semântica da região;
- saída formatada e testável.

Por isso, ele pode ser reutilizado como base para:

- testes automatizados;
- serviços internos;
- APIs futuras;
- validações em sites e formulários que consumam essa lógica no backend.

---

> **Assinatura de Origem**  
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositório **Felixo System Design**.  
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design  
> Data desta versão: 2026-03-23  
> Sugestões e pull requests são bem-vindos.
