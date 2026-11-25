import { describe, expect, it } from 'vitest'
import { planDesktopAttention, type DesktopAttentionItem } from './desktop-attention'
import { DEFAULT_SYSTEM_NOTIFICATION_PREFERENCES } from './notification-preferences'

const on = { ...DEFAULT_SYSTEM_NOTIFICATION_PREFERENCES, enabled: true }
const item = (nodeId: string, category: DesktopAttentionItem['category'], label = `Agente ${nodeId}`) => ({
  nodeId,
  label,
  category,
})

describe('planDesktopAttention', () => {
  it('não avisa com a opção desligada (padrão)', () => {
    expect(planDesktopAttention([item('a', 'needs-response')], DEFAULT_SYSTEM_NOTIFICATION_PREFERENCES, false)).toBeNull()
  })

  it('não avisa com o app em foco', () => {
    expect(planDesktopAttention([item('a', 'needs-response')], on, true)).toBeNull()
  })

  it('avisa um agente com categoria, nome do bloco e destino do clique', () => {
    expect(planDesktopAttention([item('a', 'needs-response', 'Revisor')], on, false)).toEqual({
      title: 'Precisa de resposta',
      body: 'Revisor',
      nodeId: 'a',
    })
  })

  it('respeita as categorias: "Terminou" começa desligada', () => {
    expect(planDesktopAttention([item('a', 'finished')], on, false)).toBeNull()
    const plan = planDesktopAttention([item('a', 'finished'), item('b', 'failed')], on, false)
    expect(plan?.nodeId).toBe('b')
  })

  it('junta uma rajada em um único aviso sem destino', () => {
    const batch = ['a', 'b', 'c', 'd', 'e'].map((id) => item(id, 'needs-response'))
    const plan = planDesktopAttention(batch, on, false)
    expect(plan).toEqual({
      title: '5 agentes precisam de você',
      body: 'Agente a, Agente b, Agente c e mais 2',
    })
  })
})
