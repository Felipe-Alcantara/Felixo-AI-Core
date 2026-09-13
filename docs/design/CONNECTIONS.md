# Connections

Uma edge salva é uma relação silenciosa. Hover e seleção aumentam contraste
apenas o suficiente para inspeção.

Quando uma ligação dispara entrega de contexto ou colaboração, o sink real do
PTY confirma o resultado. A edge correspondente recebe a classe de rota por
900ms e retorna ao estado neutro. Falha, ausência de sessão ou rejeição não
produzem pulso de sucesso.

Essa regra é deliberada: proximidade no canvas e status de processamento não
são evidência de fluxo de dados.
