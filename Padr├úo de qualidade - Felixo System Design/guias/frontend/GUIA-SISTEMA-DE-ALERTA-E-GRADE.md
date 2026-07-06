# ⏰ GUIA-SISTEMA-DE-ALERTA-E-GRADE-DE-HORARIOS-REUTILIZAVEL-DO-FELIPE-SALA-BOARD.md

> **O que é**: Um guia reutilizável para construir um **sistema de alerta automático de próxima aula** com parser de grade de horários, resolução de cores por sala e tabela semanal visual.
>
> **De onde vem**: Este padrão foi extraído dos componentes `scheduleAlert.ts` e `Schedule.tsx` do projeto **Felipe Sala Board**.
>
> **Qual é o propósito dentro de `guias/`**: Registrar essa solução como um bloco reaproveitável do `Felixo System Design`, separando o padrão técnico do restante do produto original.
>
> **Quando usar**: Painéis acadêmicos, portais de turma, apps de agenda escolar, dashboards de professor e qualquer sistema que precise exibir uma grade semanal com alertas contextuais.

Este documento não tenta explicar o `Felipe Sala Board` inteiro. O foco aqui é isolar o parser de células de horário, o algoritmo de próxima aula, o sistema de cores por sala e a tabela visual que resolveram esse caso de uso e podem ser transportados para outros projetos.

---

## Visão geral

O sistema é composto por **3 camadas**:

| Camada | Onde | Responsabilidade |
|---|---|---|
| **Parser de célula** | `scheduleAlert.ts` | Extrai matéria, professor e sala de strings no formato `"Matéria \| Prof \| Sala"` |
| **Alerta de próxima aula** | `scheduleAlert.ts` | Varre a grade e encontra a aula mais próxima no futuro |
| **Tabela visual** | `Schedule.tsx` | Renderiza grade 5×N com cores por sala e coluna sticky de horário |

---

## 1. Modelo de dados — Grade de horários

### Interface

```typescript
interface ScheduleClass {
  time: string;         // "18:30 - 19:20"
  monday?: string;      // "Inteligência Artificial | Marcelo Arantes | Lab.03 / Bloco I"
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
}
```

### Formato de cada célula

As células seguem o padrão `"Matéria | Professor | Sala"` com variações:

| Formato | Exemplo |
|---|---|
| Só matéria | `"Inteligência Artificial"` |
| Matéria + sala | `"Inteligência Artificial \| Lab.03 / Bloco I"` |
| Matéria + professor + sala | `"Inteligência Artificial \| Marcelo Arantes \| Lab.03 / Bloco I"` |
| Continuação | `"..."` (indica extensão da aula anterior) |
| Vazio | `undefined` (sem aula naquele horário) |

---

## 2. Parser de célula — `parseScheduleCell`

O parser separa a string por `|` e determina a estrutura com base no número de partes:

```typescript
interface ParsedScheduleCell {
  subject: string;
  teacher?: string;
  room?: string;
}

function parseScheduleCell(raw: string): ParsedScheduleCell {
  const parts = raw
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { subject: '' };
  }

  if (parts.length === 1) {
    return { subject: parts[0] };
  }

  if (parts.length === 2) {
    const [subject, secondPart] = parts;
    // Heurística: se a segunda parte começa com prefixo de sala, é sala
    const looksLikeRoom = secondPart.startsWith('Lab.') || secondPart.startsWith('Bloco');

    if (looksLikeRoom) {
      return { subject, room: secondPart };
    }

    return { subject, teacher: secondPart };
  }

  return {
    subject: parts[0],
    teacher: parts[1],
    room: parts[2]
  };
}
```

**Pontos-chave:**
- **2 partes**: Precisa de heurística para saber se a segunda parte é professor ou sala
- **Heurística de sala**: Verifica se começa com `Lab.` ou `Bloco`. Adapte esses prefixos ao seu contexto
- **Continuação**: Quando `subject === '...'`, o componente trata como continuação visual

---

## 3. Alerta de próxima aula — `getNextClassAlert`

### Mapa de dias da semana

```typescript
type ScheduleDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';

const weekDays: Array<{ key: ScheduleDay; dayNumber: number; label: string }> = [
  { key: 'monday', dayNumber: 1, label: 'segunda-feira' },
  { key: 'tuesday', dayNumber: 2, label: 'terca-feira' },
  { key: 'wednesday', dayNumber: 3, label: 'quarta-feira' },
  { key: 'thursday', dayNumber: 4, label: 'quinta-feira' },
  { key: 'friday', dayNumber: 5, label: 'sexta-feira' }
];
```

### Extrator de horário de início

```typescript
function getStartTime(timeRange: string) {
  const match = timeRange.match(/(\d{1,2}:\d{2})/);

  if (!match) return null;

  const [hours, minutes] = match[1].split(':').map(Number);
  return { label: match[1], hours, minutes };
}
```

### Algoritmo de busca da próxima aula

```typescript
interface NextClassCandidate {
  date: Date;
  dayOffset: number;
  startTime: string;
  classInfo: ParsedScheduleCell;
}

function buildCandidate(schedule: ScheduleClass[], now: Date): NextClassCandidate | null {
  let closestClass: NextClassCandidate | null = null;

  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const candidateDate = new Date(now);
    candidateDate.setHours(0, 0, 0, 0);
    candidateDate.setDate(now.getDate() + dayOffset);

    const weekDay = weekDays.find((day) => day.dayNumber === candidateDate.getDay());
    if (!weekDay) continue;  // Pula sábado e domingo

    for (const slot of schedule) {
      const rawCell = slot[weekDay.key];
      if (!rawCell) continue;

      const classInfo = parseScheduleCell(rawCell);
      if (!classInfo.subject || classInfo.subject === '...') continue;

      const startTime = getStartTime(slot.time);
      if (!startTime) continue;

      const classDate = new Date(candidateDate);
      classDate.setHours(startTime.hours, startTime.minutes, 0, 0);

      if (classDate <= now) continue;  // Já passou

      if (!closestClass || classDate < closestClass.date) {
        closestClass = { date: classDate, dayOffset, startTime: startTime.label, classInfo };
      }
    }
  }

  return closestClass;
}
```

**Como funciona:**
1. Itera de hoje até 7 dias à frente
2. Para cada dia, verifica se é dia útil (segunda a sexta)
3. Para cada slot da grade daquele dia, parseia a célula
4. Ignora slots vazios, continuações (`...`) e horários já passados
5. Mantém o candidato com a data mais próxima do `now`

### Resolução de rótulo temporal

```typescript
function resolveWhenLabel(dayOffset: number, date: Date): string {
  if (dayOffset === 0) return 'hoje';
  if (dayOffset === 1) return 'amanha';
  const weekDay = weekDays.find((day) => day.dayNumber === date.getDay());
  return weekDay?.label ?? 'nos proximos dias';
}
```

### Montagem do alerta

```typescript
interface AlertBanner {
  message: string;
  type: 'info' | 'warning' | 'success';
}

function getNextClassAlert(
  schedule: ScheduleClass[],
  fallbackAlert: AlertBanner,
  now = new Date()
): AlertBanner {
  const nextClass = buildCandidate(schedule, now);

  if (!nextClass) return fallbackAlert;

  const parts = [
    `Proxima aula: ${nextClass.classInfo.subject}`,
    `${resolveWhenLabel(nextClass.dayOffset, nextClass.date)} as ${nextClass.startTime}`
  ];

  if (nextClass.classInfo.teacher) parts.push(`com ${nextClass.classInfo.teacher}`);
  if (nextClass.classInfo.room) parts.push(`em ${nextClass.classInfo.room}`);

  return { message: parts.join(' ') + '.', type: 'warning' };
}
```

**Resultado**: `"Proxima aula: Inteligência Artificial amanha as 18:30 com Marcelo Arantes em Lab.03 / Bloco I."`

---

## 4. Atualização automática do alerta

O banner se atualiza a cada minuto para refletir a aula mais próxima:

```typescript
const [currentTime, setCurrentTime] = useState(() => Date.now());

useEffect(() => {
  const intervalId = window.setInterval(() => {
    setCurrentTime(Date.now());
  }, 60000);  // 1 minuto
  return () => window.clearInterval(intervalId);
}, []);

const activeAlert = getNextClassAlert(data.schedule, data.alertBanner, new Date(currentTime));
```

---

## 5. Banner visual com tipos

```typescript
function AlertBanner({ alert }: { alert: AlertBannerType }) {
  const styles = {
    info: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
    warning: 'bg-yellow-400/10 border-yellow-400/20 text-yellow-100',
    success: 'bg-green-500/10 border-green-500/20 text-green-300'
  }[alert.type];

  return (
    <div className={`${styles} border rounded-xl py-4 px-6`}>
      <p className="font-semibold text-sm">{alert.message}</p>
    </div>
  );
}
```

---

## 6. Tabela de grade de horários com cores por sala

### Sistema de cores por sala

```typescript
const roomLegend = [
  { key: 'Lab.01', cellClass: 'bg-[#8A8A8A]', textClass: 'text-zinc-900' },
  { key: 'Lab.02', cellClass: 'bg-[#223A70]', textClass: 'text-zinc-50' },
  { key: 'Lab.03', cellClass: 'bg-[#EDD98A]', textClass: 'text-zinc-900' },
  { key: 'Lab.04', cellClass: 'bg-[#F5A000]', textClass: 'text-zinc-900' },
  { key: 'Lab.05', cellClass: 'bg-[#87A8D6]', textClass: 'text-zinc-900' },
  { key: 'Lab.06', cellClass: 'bg-[#E9AB7B]', textClass: 'text-zinc-900' },
  // ... adicione mais salas conforme necessário
] as const;

function resolveCellColor(room?: string): string {
  if (!room) return 'bg-zinc-900/70 text-zinc-100';
  const legendItem = roomLegend.find((item) => room.includes(item.key));
  if (!legendItem) return 'bg-zinc-900/70 text-zinc-100';
  return `${legendItem.cellClass} ${legendItem.textClass}`;
}
```

**Como funciona**: Cada sala tem uma cor de fundo + cor de texto que garante contraste. A função `resolveCellColor` usa `includes` para encontrar a sala na string (ex: `"Lab.06 - 405 / Bloco IV"` → encontra `Lab.06`).

### Tabela com coluna sticky

```tsx
<div className="overflow-x-auto rounded-3xl border border-white/10 bg-zinc-950/50">
  <table className="w-full">
    <thead>
      <tr className="border-b border-white/10">
        <th className="sticky left-0 z-20 bg-zinc-950 p-3 text-left font-bold text-white text-sm border-r border-white/5 shadow-[4px_0_12px_-2px_rgba(0,0,0,0.8)]">
          Horário
        </th>
        {dayLabels.map((day) => (
          <th key={day} className="p-3 text-left font-bold text-white text-sm border-r border-white/5 last:border-r-0 min-w-[160px]">
            {day}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {schedule.map((slot, index) => (
        <tr key={index} className="border-t border-white/5">
          <td className="sticky left-0 z-20 bg-zinc-950 p-3 font-semibold text-felixo-purple text-sm border-r border-white/5 shadow-[4px_0_12px_-2px_rgba(0,0,0,0.8)] whitespace-nowrap">
            {slot.time}
          </td>
          {days.map((day) => {
            const cellValue = slot[day];
            if (!cellValue) return <td key={day} className="...">-</td>;

            const parsedCell = parseScheduleCell(cellValue);
            if (parsedCell.subject === '...') return <td key={day} className="...">...</td>;

            return (
              <td key={day} className={`p-3 text-sm align-top ${resolveCellColor(parsedCell.room)}`}>
                <p className="font-semibold leading-tight">{parsedCell.subject}</p>
                {parsedCell.teacher && <p className="mt-1 text-xs font-semibold">{parsedCell.teacher}</p>}
                {parsedCell.room && <p className="mt-1 text-[11px] font-medium opacity-90">{parsedCell.room}</p>}
              </td>
            );
          })}
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

**Pontos-chave:**
- `sticky left-0` → Coluna de horário fixa ao rolar horizontalmente (essencial em mobile)
- `shadow-[4px_0_12px_-2px_rgba(0,0,0,0.8)]` → Sombra que separa visualmente a coluna sticky
- `min-w-[160px]` → Largura mínima para cada coluna de dia
- `align-top` → Células com conteúdo variável alinham pelo topo

---

## 7. Como reutilizar em outro projeto

### Passo 1: Definir o formato de dados

Adapte `ScheduleClass` ao seu contexto:

```typescript
interface ScheduleSlot {
  time: string;
  [day: string]: string | undefined;  // chave por dia da semana
}
```

### Passo 2: Copiar o parser

Copie `parseScheduleCell` e adapte a heurística de sala aos prefixos do seu contexto (ex: `Sala`, `Auditório`, `Andar`).

### Passo 3: Copiar o algoritmo de alerta

Copie `buildCandidate` e `getNextClassAlert`. Adapte `weekDays` se precisar incluir sábado/domingo.

### Passo 4: Definir mapa de cores

Crie seu próprio `roomLegend` com as salas e cores do seu contexto.

### Passo 5: Customizar visual

| O que | Onde mexer |
|---|---|
| **Cor do horário** | Troque `text-felixo-purple` na coluna sticky |
| **Intervalo de atualização** | Ajuste `60000` no `setInterval` |
| **Dias da semana** | Adicione sábado/domingo em `weekDays` |
| **Heurística de sala** | Adapte `startsWith('Lab.')` em `parseScheduleCell` |
| **Cor padrão** | Ajuste `bg-zinc-900/70 text-zinc-100` em `resolveCellColor` |

### Passo 6: Instalar dependências

Nenhuma dependência extra. Usa apenas React e Tailwind CSS.

---

## 8. Referência de arquivos (no projeto original)

| Arquivo | O que faz |
|---|---|
| `src/utils/scheduleAlert.ts` | Parser de célula + algoritmo de próxima aula + montagem de alerta |
| `src/components/Schedule.tsx` | Tabela visual com cores por sala e coluna sticky |
| `src/data/mockData.ts` | Interfaces ScheduleClass, AlertBanner e dados de exemplo |
| `src/pages/GestaoPage.tsx` | Banner de alerta com atualização por timer |

---

## Resumo da receita

1. **Formato de dados**: `"Matéria | Professor | Sala"` separado por pipe
2. **Parser**: Divide por `|`, usa heurística para distinguir professor de sala
3. **Alerta automático**: Varre 7 dias à frente, encontra a aula mais próxima no futuro
4. **Timer**: `setInterval` de 1 minuto para manter o alerta atualizado
5. **Cores por sala**: Mapa `key → cellClass + textClass` com `includes` para matching parcial
6. **Coluna sticky**: `sticky left-0` + sombra para fixar horário ao rolar
7. **Fallback**: Se não encontrar próxima aula, exibe banner padrão configurável
8. **Tipos de alerta**: `info` (azul), `warning` (amarelo), `success` (verde)

---

> **Assinatura de Origem**
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositório **Felixo System Design**.
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design
> Data desta versão: 2026-05-23
> Sugestões e pull requests são bem-vindos.
