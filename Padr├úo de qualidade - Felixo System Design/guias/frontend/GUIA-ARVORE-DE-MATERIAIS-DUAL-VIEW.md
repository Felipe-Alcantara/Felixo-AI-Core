# 🌲 GUIA-ARVORE-DE-MATERIAIS-COM-DUAL-VIEW-E-TRACKING-REUTILIZAVEL-DO-FELIPE-SALA-BOARD.md

> **O que é**: Um guia reutilizável para construir uma **árvore de materiais com dois modos de visualização** (simples e dinâmico), tracking de itens vistos via localStorage e contagem de progresso por pasta.
>
> **De onde vem**: Este padrão foi extraído do componente `MaterialTree` do projeto **Felipe Sala Board**.
>
> **Qual é o propósito dentro de `guias/`**: Registrar essa solução como um bloco reaproveitável do `Felixo System Design`, separando o padrão técnico do restante do produto original.
>
> **Quando usar**: Bibliotecas de materiais didáticos, exploradores de documentos, repositórios de arquivos organizados por pasta, listas de leitura com progresso e qualquer interface com navegação hierárquica que precise rastrear o que o usuário já acessou.

Este documento não tenta explicar o `Felipe Sala Board` inteiro. O foco aqui é isolar a estratégia de árvore recursiva com dual-view, tracking de progresso e persistência em localStorage que resolveram esse caso de uso e podem ser transportados para outros projetos.

---

## Visão geral

O componente é composto por **4 camadas**:

| Camada | Onde | Responsabilidade |
|---|---|---|
| **Modelo de dados** | `MaterialNode` | Estrutura recursiva folder/file com ID, label, type e children |
| **Modo simples** | `SimpleTreeNode` | Árvore leve sem animação, com collapse global por signal |
| **Modo dinâmico** | `DynamicTreeNode` | Árvore animada com Framer Motion, expand/collapse por ID |
| **Container** | `MaterialTree` | Gerencia estado compartilhado, alternância de modo e progresso |

---

## 1. Modelo de dados — MaterialNode

```typescript
interface MaterialNode {
  id: string;
  label: string;
  type: 'folder' | 'file';
  url?: string;              // Apenas para type: 'file'
  children?: MaterialNode[]; // Apenas para type: 'folder'
}
```

**Exemplo de dados:**

```typescript
const materials: MaterialNode[] = [
  {
    id: 'ia',
    label: 'Inteligência Artificial',
    type: 'folder',
    children: [
      {
        id: 'ia-1',
        label: 'Aula 1 - Introdução',
        type: 'folder',
        children: [
          { id: 'ia-1-1', label: 'Slides (PPTX)', type: 'file', url: 'https://...' },
          { id: 'ia-1-2', label: 'Exercício', type: 'file', url: 'https://...' }
        ]
      }
    ]
  }
];
```

**Convenção de IDs**: Use prefixo hierárquico (ex: `ia-1-1`) para facilitar debug, mas o sistema funciona com qualquer formato de ID único.

---

## 2. Helpers

### Coletor recursivo de IDs de arquivos

```typescript
function collectFileIds(node: MaterialNode): string[] {
  if (node.type === 'file') return [node.id];
  return (node.children ?? []).flatMap(collectFileIds);
}
```

**Uso**: Dado um nó (pasta ou arquivo), retorna todos os IDs de arquivo dentro dele. Usado para calcular contagem de vistos por pasta.

### localStorage — carregar e salvar

```typescript
const STORAGE_KEY = 'viewedMaterials';
const VIEW_MODE_KEY = 'materialViewMode';

function loadViewed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}

function saveViewed(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

type ViewMode = 'simple' | 'dynamic';

function loadViewMode(): ViewMode {
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY);
    if (raw === 'simple') return 'simple';
  } catch { /* ignore */ }
  return 'dynamic';
}
```

**Pontos-chave:**
- `Set<string>` serializado como array JSON (`[...ids]`)
- Fallback silencioso (`catch { /* ignore */ }`) para ambientes sem localStorage
- View mode persiste preferência do usuário entre sessões

---

## 3. Modo simples — SimpleTreeNode

### Anatomia visual

```
📁 Inteligência Artificial                    3/5
  📂 Aula 1 - Introdução                     2/2
    ✓ 📄 Slides (PPTX)                        (visto)
    ✓ 📄 Exercício                             (visto)
  📁 Aula 2 - Agentes                        1/3
    ☐ 📄 Slides (PPTX)
    ✓ 📄 Exercício 1                           (visto, riscado)
    ☐ 📄 Exercício 2
```

### Implementação

```tsx
function SimpleTreeNode({ node, depth, collapseSignal, viewedIds, onToggleViewed }) {
  const [open, setOpen] = useState(false);

  // Colapsa quando o signal muda (botão "Recolher tudo")
  useEffect(() => { setOpen(false); }, [collapseSignal]);

  if (node.type === 'file') {
    const viewed = viewedIds.has(node.id);
    return (
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
      >
        {/* Checkbox de visto */}
        <button
          onClick={() => onToggleViewed(node.id)}
          className={`w-4 h-4 rounded border ${
            viewed ? 'bg-green-500 border-green-400 text-white' : 'border-zinc-600 hover:border-zinc-400'
          } flex items-center justify-center text-[10px]`}
        >
          {viewed && '✓'}
        </button>
        {/* Link do arquivo */}
        <a href={node.url} target="_blank" rel="noreferrer"
           className={viewed ? 'text-zinc-500 line-through' : 'hover:text-white'}>
          📄 {node.label}
        </a>
      </div>
    );
  }

  // Pasta: mostra seta + ícone + label + contagem
  const fileIds = collectFileIds(node);
  const viewedCount = fileIds.filter((id) => viewedIds.has(id)).length;
  const totalCount = fileIds.length;
  const allViewed = totalCount > 0 && viewedCount === totalCount;

  return (
    <div>
      <button onClick={() => setOpen(!open)}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white hover:bg-white/5"
              style={{ paddingLeft: `${depth * 20 + 12}px` }}>
        <span className={`text-[10px] transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        <span>{open ? '📂' : '📁'}</span>
        <span className={allViewed ? 'text-zinc-500' : ''}>{node.label}</span>
        {totalCount > 0 && (
          <span className={`ml-auto text-xs font-normal ${allViewed ? 'text-green-500' : 'text-zinc-500'}`}>
            {viewedCount}/{totalCount}
          </span>
        )}
      </button>
      {open && node.children?.map((child) => (
        <SimpleTreeNode key={child.id} node={child} depth={depth + 1}
                        collapseSignal={collapseSignal} viewedIds={viewedIds} onToggleViewed={onToggleViewed} />
      ))}
    </div>
  );
}
```

**Pontos-chave:**
- **Collapse global**: `collapseSignal` é um counter que, ao mudar, faz todos os nós fecharem via `useEffect`
- **Indentação**: `depth * 20 + 12` px de padding esquerdo
- **Feedback visual**: Arquivo visto fica com texto `line-through` e cor `text-zinc-500`
- **Contagem**: `viewedCount/totalCount` exibida em cada pasta, verde se completa

---

## 4. Modo dinâmico — DynamicTreeNode

### Diferenças em relação ao modo simples

| Aspecto | Simples | Dinâmico |
|---|---|---|
| **Animação** | Nenhuma | Framer Motion (expand/collapse + fade-in) |
| **Estado de expansão** | Local por nó (`useState`) | Centralizado (`Set<string>` no container) |
| **Collapse global** | Via signal counter | Via `setExpandedIds(new Set())` |
| **Ícones** | Emoji (`📁`, `📂`, `📄`) | Lucide React (`Folder`, `FolderOpen`, `FileText`, `Check`) |
| **Seta** | Emoji rotacionado | `ChevronRight` animado com `motion.span` |

### Implementação (arquivo)

```tsx
function DynamicTreeNode({ node, depth, expandedIds, onToggleExpand, viewedIds, onToggleViewed }) {
  if (node.type === 'file') {
    const viewed = viewedIds.has(node.id);
    return (
      <motion.div
        className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5"
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.15 }}
      >
        <button onClick={() => onToggleViewed(node.id)}
                className={`w-4 h-4 rounded border ${
                  viewed ? 'bg-green-500 border-green-400 scale-110' : 'border-zinc-600 hover:border-purple-400'
                }`}>
          {viewed && <Check size={10} />}
        </button>
        <a href={node.url} target="_blank" rel="noreferrer"
           className={viewed ? 'text-zinc-500 line-through' : 'text-zinc-300 hover:text-white'}>
          <FileText size={14} className={viewed ? 'text-zinc-600' : 'text-purple-400/70'} />
          {node.label}
        </a>
      </motion.div>
    );
  }

  const isExpanded = expandedIds.has(node.id);
  // ... mesma lógica de contagem ...

  return (
    <div>
      <motion.button onClick={() => onToggleExpand(node.id)} whileTap={{ scale: 0.98 }}
                     style={{ paddingLeft: `${depth * 16 + 12}px` }}>
        <motion.span animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronRight size={14} />
        </motion.span>
        {isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
        {node.label}
        <span>{viewedCount}/{totalCount}</span>
      </motion.button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {node.children?.map((child) => (
              <DynamicTreeNode key={child.id} node={child} depth={depth + 1} ... />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

**Pontos-chave:**
- `initial={{ opacity: 0, x: -8 }}` → Arquivos fazem slide-in ao aparecer
- `whileTap={{ scale: 0.98 }}` → Feedback tátil no clique
- `AnimatePresence` → Anima tanto entrada quanto saída dos filhos
- `height: 0 → auto` → Expansão suave sem pular
- Indentação de 16px por nível (vs 20px no modo simples) para visual mais compacto

---

## 5. Container — MaterialTree

```tsx
function MaterialTree({ nodes }: { nodes: MaterialNode[] }) {
  // Estado compartilhado entre os dois modos
  const [viewedIds, setViewedIds] = useState<Set<string>>(() => loadViewed());
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewMode());

  // Estado exclusivo do modo simples
  const [collapseSignal, setCollapseSignal] = useState(0);

  // Estado exclusivo do modo dinâmico
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const handleToggleViewed = useCallback((id: string) => {
    setViewedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveViewed(next);
      return next;
    });
  }, []);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCollapseAll = useCallback(() => {
    if (viewMode === 'simple') setCollapseSignal((s) => s + 1);
    else setExpandedIds(new Set());
  }, [viewMode]);

  const handleSwitchView = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  }, []);

  // Progresso global
  const allFileIds = useMemo(() => nodes.flatMap(collectFileIds), [nodes]);
  const totalViewed = allFileIds.filter((id) => viewedIds.has(id)).length;
  const totalFiles = allFileIds.length;

  return (
    <section>
      {/* Header com contagem, toggle de modo e botão de colapsar */}
      <div className="flex items-end justify-between">
        <h2>Materiais das Aulas</h2>
        <div className="flex items-center gap-3">
          <span>{totalViewed}/{totalFiles} vistos</span>
          <label>
            <input type="checkbox" checked={viewMode === 'simple'}
                   onChange={(e) => handleSwitchView(e.target.checked ? 'simple' : 'dynamic')} />
            Modo simplificado
          </label>
          <button onClick={handleCollapseAll}>Recolher tudo</button>
        </div>
      </div>

      {/* Árvore */}
      <div className="rounded-3xl border border-white/10 bg-zinc-950/50 py-2">
        {viewMode === 'simple'
          ? nodes.map((node) => <SimpleTreeNode key={node.id} node={node} depth={0} ... />)
          : nodes.map((node) => <DynamicTreeNode key={node.id} node={node} depth={0} ... />)
        }
      </div>
    </section>
  );
}
```

---

## 6. Padrões reutilizáveis isolados

### Padrão: Toggle Set (add/remove em Set imutável)

```typescript
const handleToggle = useCallback((id: string) => {
  setState((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}, []);
```

Usado para: `viewedIds`, `expandedIds`. Garante imutabilidade para React detectar mudanças.

### Padrão: Collapse global por signal

```typescript
const [collapseSignal, setCollapseSignal] = useState(0);

// No nó filho:
useEffect(() => { setOpen(false); }, [collapseSignal]);

// No container:
const handleCollapseAll = () => setCollapseSignal((s) => s + 1);
```

Alternativa a gerenciar estado de expansão de todos os nós: um counter que, ao mudar, faz todos os `useEffect` dispararem.

### Padrão: Contagem de progresso por pasta

```typescript
const fileIds = collectFileIds(node);
const viewedCount = fileIds.filter((id) => viewedIds.has(id)).length;
const totalCount = fileIds.length;
const allViewed = totalCount > 0 && viewedCount === totalCount;
```

Calcula `3/5` para qualquer nó da árvore, recursivamente.

---

## 7. Como reutilizar em outro projeto

### Passo 1: Definir a interface do nó

Adapte `MaterialNode` ao seu domínio:

```typescript
interface TreeNode {
  id: string;
  label: string;
  type: 'folder' | 'file';
  url?: string;
  children?: TreeNode[];
}
```

### Passo 2: Instalar dependências

```bash
# Obrigatório apenas para o modo dinâmico:
npm install framer-motion lucide-react
```

O modo simples funciona sem nenhuma dependência extra.

### Passo 3: Escolher o modo

| Cenário | Modo recomendado |
|---|---|
| Performance é prioridade | Simples |
| UX polida é prioridade | Dinâmico |
| Ambos, com toggle | Container com dual-view |

### Passo 4: Customizar visual

| O que | Onde mexer |
|---|---|
| **Cor de visto** | Troque `bg-green-500` pelo que quiser |
| **Cor da pasta** | Troque `text-purple-400` |
| **Indentação simples** | Ajuste `20` em `depth * 20 + 12` |
| **Indentação dinâmica** | Ajuste `16` em `depth * 16 + 12` |
| **Chave de localStorage** | Troque `viewedMaterials` e `materialViewMode` |
| **Velocidade da animação** | Ajuste `duration: 0.2` e `duration: 0.15` |

### Passo 5: Uso no componente pai

```tsx
import MaterialTree from './components/MaterialTree';

function App() {
  const materials: MaterialNode[] = [/* seus dados */];
  return <MaterialTree nodes={materials} />;
}
```

---

## 8. Referência de arquivos (no projeto original)

| Arquivo | O que faz |
|---|---|
| `src/components/MaterialTree.tsx` | Componente completo (SimpleTreeNode + DynamicTreeNode + container) |
| `src/data/mockData.ts` | Interface MaterialNode e dados de exemplo |

---

## Resumo da receita

1. **Modelo de dados**: Nós recursivos com `type: 'folder' | 'file'`
2. **Coletor de IDs**: `collectFileIds()` com `flatMap` recursivo
3. **Modo simples**: Estado local por nó, collapse por signal counter
4. **Modo dinâmico**: Estado centralizado de expansão, animação com Framer Motion
5. **Tracking de vistos**: `Set<string>` sincronizado com localStorage
6. **Contagem por pasta**: `fileIds.filter(viewed).length / totalCount`
7. **Toggle de modo**: Checkbox que persiste preferência no localStorage
8. **Progresso global**: Header com `totalViewed/totalFiles`

---

> **Assinatura de Origem**
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositório **Felixo System Design**.
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design
> Data desta versão: 2026-05-23
> Sugestões e pull requests são bem-vindos.
