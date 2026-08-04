import { describe, expect, it } from 'vitest'
import {
  getMenuPanelPreparationDelay,
  MENU_BUTTON_EXPANSION_MS,
  MENU_PANEL_PREPARE_LEAD_MS,
} from './menu-panel-timing'

describe('getMenuPanelPreparationDelay', () => {
  it('prepares the panel shortly before the default button expansion ends', () => {
    expect(getMenuPanelPreparationDelay()).toBe(
      MENU_BUTTON_EXPANSION_MS - MENU_PANEL_PREPARE_LEAD_MS,
    )
  })

  it('never returns a negative timeout for short transitions', () => {
    expect(getMenuPanelPreparationDelay(20, 50)).toBe(0)
  })
})
