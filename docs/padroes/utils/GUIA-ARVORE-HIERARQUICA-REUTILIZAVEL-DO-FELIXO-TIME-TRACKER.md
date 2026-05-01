# 🌳 GUIA-ARVORE-HIERARQUICA-REUTILIZAVEL-DO-FELIXO-TIME-TRACKER.md

Status: concluido.

> **O que é**: Um guia reutilizável para construir uma **árvore hierárquica interativa** no estilo file explorer.
>
> **De onde vem**: Este padrão foi extraído do componente `CategoryTree` do projeto **Felixo Time Tracker**.
>
> **Qual é o propósito dentro de `Utils/`**: Registrar essa solução como um bloco reaproveitável do `Felixo System Design`, separando o padrão técnico do restante do produto original.
>
> **Quando usar**: Categorias, pastas, menus aninhados, estruturas organizacionais e qualquer dado em formato parent-child.

Este documento não tenta explicar o `Felixo Time Tracker` inteiro. O foco aqui é isolar a estratégia de modelagem, serialização e renderização recursiva que resolveu esse caso de uso e pode ser transportada para outros projetos.

---

## Visão geral

O explorador é composto por **3 camadas**:

| Camada | Onde | Responsabilidade |
|---|---|---|
| **Dados hierárquicos** | Backend (Django) | Modelo com self-referential FK + serializer recursivo que retorna árvore aninhada |
| **Componente recursivo** | Frontend (React) | `CategoryTreeItem` que renderiza a si mesmo para cada filho |
| **Container** | Frontend (React) | `CategoryTree` que gerencia estado de expansão, seleção e ações |

---

## 1. Backend — Modelo hierárquico

### O Model

A chave é um `ForeignKey` apontando para o próprio modelo (`'self'`):

```python
class Category(models.Model):
    name = models.CharField(max_length=100)
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children'  # ← Isso permite acessar filhos via category.children.all()
    )
    path = models.CharField(max_length=500, db_index=True)  # Path desnormalizado
    icon = models.CharField(max_length=50, blank=True)

    class Meta:
        ordering = ['path']

    def save(self, *args, **kwargs):
        # Calcula path automaticamente
        if self.parent:
            self.path = f"{self.parent.path}/{self.name}"
        else:
            self.path = f"/{self.name}"
        super().save(*args, **kwargs)

    def get_descendants(self):
        """Busca todos os descendentes usando o path desnormalizado."""
        return Category.objects.filter(path__startswith=f"{self.path}/")
```

**Por que o campo `path`?**

- Permite buscar **todos os descendentes** com uma única query: `path__startswith="/Trabalho/"` retorna `/Trabalho/Coding`, `/Trabalho/Coding/Python`, etc.
- Sem `path`, seria necessário fazer queries recursivas ou usar CTEs.
- Trade-off: precisa atualizar o `path` dos descendentes se renomear um pai.

### O Serializer recursivo

O serializer chama a si mesmo para serializar os filhos:

```python
class CategorySerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ['id', 'name', 'parent', 'path', 'icon', 'children']
        read_only_fields = ['path']

    def get_children(self, obj):
        children = obj.children.all()
        return CategorySerializer(children, many=True).data
```

### A ViewSet action para a árvore

```python
class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

    @action(detail=False, methods=['get'])
    def tree(self, request):
        """Retorna apenas categorias raiz — filhos vêm aninhados via serializer."""
        root_categories = Category.objects.filter(parent=None)
        serializer = self.get_serializer(root_categories, many=True)
        return Response(serializer.data)
```

### O que a API retorna

```json
[
  {
    "id": 1,
    "name": "Trabalho",
    "parent": null,
    "path": "/Trabalho",
    "icon": "",
    "children": [
      {
        "id": 2,
        "name": "Coding",
        "parent": 1,
        "path": "/Trabalho/Coding",
        "icon": "",
        "children": [
          {
            "id": 5,
            "name": "Python",
            "parent": 2,
            "path": "/Trabalho/Coding/Python",
            "icon": "",
            "children": []
          }
        ]
      },
      {
        "id": 3,
        "name": "Reuniões",
        "parent": 1,
        "path": "/Trabalho/Reuniões",
        "icon": "",
        "children": []
      }
    ]
  }
]
```

---

## 2. Frontend — Componente recursivo

### Anatomia visual

```
┌──────────────────────────────────────┐
│ Categorias                    [+Nova]│  ← CardHeader
├──────────────────────────────────────┤
│ ✓ /Trabalho/Coding         [Limpar] │  ← Breadcrumb da seleção
├──────────────────────────────────────┤
│ ▼ 📂 Trabalho                    [+]│  ← Nível 0, expandida
│   ▼ 📂 Coding                   [+]│  ← Nível 1, expandida, selecionada
│     ■ Python                     [+]│  ← Nível 2, folha (sem filhos)
│     ■ JavaScript                 [+]│  ← Nível 2, folha
│   ▶ 📁 Reuniões                  [+]│  ← Nível 1, recolhida
│ ▶ 📁 Pessoal                     [+]│  ← Nível 0, recolhida
└──────────────────────────────────────┘
```

### CategoryTreeItem (componente recursivo)

Este é o coração do explorador. Cada item renderiza a si mesmo para cada filho:

```jsx
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, Check } from 'lucide-react';

const CategoryTreeItem = ({
  category,
  level = 0,       // Profundidade na árvore (0 = raiz)
  selectedId,      // ID do item selecionado
  expandedIds,     // Set<number> com IDs expandidos
  onToggle,        // (id) => void — expande/recolhe
  onSelect,        // (category) => void — seleciona
  onAddChild       // (category) => void — adiciona filho
}) => {
  const hasChildren = Array.isArray(category.children) && category.children.length > 0;
  const isExpanded = expandedIds.has(category.id);
  const isSelected = selectedId === category.id;

  const handleSelect = () => {
    onSelect(category);
    // Se tem filhos e está fechado, abre ao selecionar
    if (hasChildren && !isExpanded) {
      onToggle(category.id);
    }
  };

  return (
    <div className="select-none">
      {/* ═══ Linha do item ═══ */}
      <motion.div
        className={`group relative overflow-hidden ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}  // ← Indentação progressiva
        whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0 pr-8" onClick={handleSelect}>

          {/* Seta de expandir/recolher (só se tem filhos) */}
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(category.id);
              }}
              className="p-1 hover:bg-white/10 rounded"
            >
              {isExpanded
                ? <ChevronDown size={16} className="text-zinc-400" />
                : <ChevronRight size={16} className="text-zinc-400" />}
            </button>
          ) : (
            <div className="w-6" />  {/* Espaçador para alinhar itens sem filhos */}
          )}

          {/* Ícone de check (se selecionado), pasta ou quadrado (folha) */}
          <div className="relative flex items-center gap-2 flex-1 min-w-0">
            {isSelected && (
              <span className="absolute -left-5 w-4 h-4 rounded-full text-purple-400 border border-purple-400/30 bg-purple-400/10 flex items-center justify-center">
                <Check size={10} />
              </span>
            )}
            {hasChildren
              ? (isExpanded
                  ? <FolderOpen size={16} className="text-purple-400" />
                  : <Folder size={16} className="text-purple-400" />)
              : <div className="w-4 h-4 rounded bg-purple-400/20 border border-purple-400/40" />}
            <span className="text-sm text-white font-medium truncate">{category.name}</span>
          </div>
        </div>

        {/* Botão "+" (aparece no hover) */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAddChild(category); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Plus size={14} className="text-zinc-400" />
        </button>
      </motion.div>

      {/* ═══ Filhos (renderização recursiva com animação) ═══ */}
      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {category.children.map(child => (
              <CategoryTreeItem
                key={child.id}
                category={child}
                level={level + 1}       // ← Incrementa profundidade
                selectedId={selectedId}
                expandedIds={expandedIds}
                onToggle={onToggle}
                onSelect={onSelect}
                onAddChild={onAddChild}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
```

**Pontos-chave:**

- **Indentação**: `paddingLeft: level * 16 + 8` — cada nível adiciona 16px
- **Recursão**: O componente chama `<CategoryTreeItem level={level + 1} />` para cada filho
- **Animação**: `AnimatePresence` + `motion.div` com `height: 0 → auto` para expansão suave
- **Hover-reveal**: Botão `+` usa `opacity-0 group-hover:opacity-100` do Tailwind
- **Seta independente**: Clique na seta (`e.stopPropagation()`) só expande/recolhe, sem selecionar

### CategoryTree (container)

O container gerencia o estado e renderiza os itens raiz:

```jsx
import { useEffect, useMemo, useState } from 'react';

export const CategoryTree = ({
  categories = [],      // Array de categorias raiz (com children aninhados)
  selectedCategory,     // Categoria atualmente selecionada
  onCategorySelect,     // (category | null) => void
  onAddCategory,        // (parentCategory | null) => void
}) => {
  const [expandedIds, setExpandedIds] = useState(new Set());

  // ═══ Mapa de parentesco para auto-expansão ═══
  const parentById = useMemo(() => {
    const parentMap = new Map();
    const walk = (nodes = []) => {
      nodes.forEach((node) => {
        parentMap.set(node.id, node.parent ?? null);
        if (Array.isArray(node.children) && node.children.length > 0) {
          walk(node.children);
        }
      });
    };
    walk(categories);
    return parentMap;
  }, [categories]);

  // ═══ Auto-expansão: ao selecionar, expande todos os pais ═══
  useEffect(() => {
    if (!selectedCategory?.id) return;

    setExpandedIds((prev) => {
      const next = new Set(prev);
      let parentId = parentById.get(selectedCategory.id);
      while (parentId) {
        next.add(parentId);
        parentId = parentById.get(parentId);
      }
      return next;
    });
  }, [selectedCategory, parentById]);

  const handleToggleCategory = (categoryId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  return (
    <div>
      {/* Breadcrumb da seleção atual */}
      {selectedCategory?.path ? (
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-xs text-purple-400 truncate">{selectedCategory.path}</p>
          <button onClick={() => onCategorySelect(null)} className="text-xs text-zinc-400 hover:text-white">
            Limpar
          </button>
        </div>
      ) : (
        <p className="px-4 py-3 text-xs text-zinc-500">
          Clique em uma categoria para filtrar.
        </p>
      )}

      {/* Itens da árvore */}
      <div className="max-h-96 overflow-y-auto py-2">
        {categories.map(category => (
          <CategoryTreeItem
            key={category.id}
            category={category}
            selectedId={selectedCategory?.id}
            expandedIds={expandedIds}
            onToggle={handleToggleCategory}
            onSelect={onCategorySelect}
            onAddChild={(parent) => onAddCategory(parent)}
          />
        ))}
      </div>
    </div>
  );
};
```

**Pontos-chave:**

- **`expandedIds` como `Set`**: Lookup O(1) para verificar se um nó está expandido
- **`parentById` como `Map`**: Construído com `useMemo`, permite subir a árvore para auto-expansão
- **Auto-expansão**: Quando `selectedCategory` muda, percorre pais via `parentById` e adiciona todos ao `expandedIds`
- **Breadcrumb**: Mostra o `path` da categoria selecionada (ex: `/Trabalho/Coding`)

---

## 3. Os ingredientes que fazem funcionar

### Indentação progressiva

```jsx
style={{ paddingLeft: `${level * 16 + 8}px` }}
```

Cada nível da árvore adiciona 16px de padding esquerdo. Isso cria a hierarquia visual sem precisar de elementos wrapper extras.

### Ícones contextuais

| Situação | Ícone |
|---|---|
| Tem filhos + expandida | `FolderOpen` (pasta aberta) |
| Tem filhos + recolhida | `Folder` (pasta fechada) |
| Sem filhos (folha) | Quadrado colorido (`div` com border) |
| Selecionada | Check em circle (posicionado absoluto) |

### Animação de expandir/recolher

```jsx
<AnimatePresence>
  {isExpanded && hasChildren && (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      {/* filhos aqui */}
    </motion.div>
  )}
</AnimatePresence>
```

- `AnimatePresence` detecta quando o elemento sai do DOM e anima a saída
- `height: 0 → auto` cria o efeito de "deslizar para baixo"
- `overflow-hidden` evita que o conteúdo vaze durante a animação

### Hover-reveal do botão "+"

```jsx
<div className="group ...">     {/* Pai com "group" */}
  <button className="opacity-0 group-hover:opacity-100 transition-opacity">
    <Plus size={14} />
  </button>
</div>
```

Tailwind `group/group-hover` faz o botão aparecer suavemente quando o mouse passa pela linha.

### Separação de clique: seleção vs expansão

```jsx
// Clicar na linha inteira → seleciona
<div onClick={handleSelect}>...</div>

// Clicar na seta → apenas expande/recolhe
<button onClick={(e) => {
  e.stopPropagation();  // ← Impede que o handleSelect dispare
  onToggle(category.id);
}}>
```

---

## 4. Como reutilizar em outro projeto

### Passo 1: Dados hierárquicos

Garanta que seus dados venham nesta estrutura (aninhada):

```json
[
  {
    "id": 1,
    "name": "Item Raiz",
    "parent": null,
    "children": [
      {
        "id": 2,
        "name": "Filho",
        "parent": 1,
        "children": []
      }
    ]
  }
]
```

Se seus dados vêm flat (lista sem nesting), transforme-os:

```js
function buildTree(items) {
  const map = new Map();
  const roots = [];

  items.forEach(item => map.set(item.id, { ...item, children: [] }));
  items.forEach(item => {
    if (item.parent) {
      map.get(item.parent)?.children.push(map.get(item.id));
    } else {
      roots.push(map.get(item.id));
    }
  });

  return roots;
}
```

### Passo 2: Instalar dependências

```bash
npm install framer-motion lucide-react
```

### Passo 3: Copiar os componentes

1. Copie `CategoryTreeItem` — o componente recursivo
2. Copie `CategoryTree` — o container com estado
3. Adapte os nomes de props conforme seu domínio (ex: `category` → `folder`, `node`, etc)

### Passo 4: Customizar visual

As partes mais fáceis de customizar:

| O que | Onde mexer |
|---|---|
| **Cor primária** | Troque `text-purple-400`, `bg-purple-400/20` pela sua cor |
| **Indentação** | Ajuste o `16` em `level * 16 + 8` |
| **Ícones** | Troque `Folder`/`FolderOpen` por qualquer ícone do lucide |
| **Ícone de folha** | Troque o `div` quadrado por um ícone (ex: `File`, `Circle`) |
| **Altura máxima** | Ajuste `max-h-96` no container |
| **Velocidade da animação** | Ajuste `duration: 0.2` |

### Passo 5: Uso no componente pai

```jsx
import { CategoryTree } from './components/CategoryTree';

function App() {
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetch('/api/categories/tree/')
      .then(res => res.json())
      .then(setCategories);
  }, []);

  return (
    <CategoryTree
      categories={categories}
      selectedCategory={selected}
      onCategorySelect={setSelected}
      onAddCategory={(parent) => console.log('Adicionar filho de:', parent)}
    />
  );
}
```

---

## 5. Referência de arquivos (neste projeto)

| Arquivo | O que faz |
|---|---|
| `frontend/src/components/CategoryTree.jsx` | Componente completo (TreeItem + Tree container) |
| `frontend/src/components/UI.jsx` | Card, CardHeader, CardTitle, CardContent, Button usados pelo Tree |
| `backend/core/models.py` | Model Category com self-referential FK e path |
| `backend/core/serializers.py` | CategorySerializer recursivo |
| `backend/core/views.py` | CategoryViewSet com action `tree()` |

---

## Resumo da receita

1. **Model**: ForeignKey para `'self'` + campo `path` desnormalizado
2. **Serializer**: Recursivo (`get_children` chama o próprio serializer)
3. **API**: Endpoint que retorna só raízes (filhos vêm embutidos)
4. **Componente recursivo**: Renderiza a si mesmo com `level + 1`
5. **Estado de expansão**: `Set<id>` no container
6. **Auto-expansão**: `Map<id, parentId>` + walk up ao selecionar
7. **Animação**: `AnimatePresence` + `motion.div` com height transition
8. **UX**: Indentação por padding, ícones contextuais, hover-reveal, seta separada do select

---

> **Assinatura de Origem**  
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositório **Felixo System Design**.  
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design  
> Data desta versão: 2026-03-23  
> Sugestões e pull requests são bem-vindos.
