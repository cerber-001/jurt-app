import { describe, expect, it } from 'vitest'
import { FIG_EMISSIVE, FIG_FRAG, FIG_MAIN, FIG_ROUGH, INST_ATTRS, INST_STRIDE, NUR_CENTER_HEX, NUR_EDGE_HEX, NUR_GLOW, NUR_ID, figHead, figRole, shaderMat } from './shader'

const ALL = figHead([-1, 0, 1, 2, 0, 4, 5, 6, 0, 8, 9, 10], new Array(12).fill('HP'), new Array(12).fill(0)) + FIG_MAIN + FIG_FRAG + FIG_EMISSIVE + FIG_ROUGH

describe('нур вместо лиц', () => {
  it('в шейдере нет цветов глаз, радужки и губ старой страницы', () => {
    const flat = ALL.replace(/\s+/g, '')
    expect(flat).not.toContain('vec3(.92,.9,.86)')
    expect(flat).not.toContain('vec3(.06,.04,.03)')
    expect(flat).not.toContain('fSk*vec3(.86,.62,.6)')
  })
  it('материалы 8, 9, 10 (белок, радужка, губы) — нур; очки и брюки формы не берутся', () => {
    for (const m of [8, 9, 10]) { expect(figRole(m)).toBe('nur'); expect(shaderMat(m)).toBe(NUR_ID) }
    for (const m of [12, 13, 14, 99]) expect(shaderMat(m)).toBe(-1)
    for (const m of [0, 1, 2, 3, 5, 6, 7, 11]) expect(shaderMat(m)).toBe(m)
  })
  it('нур светится сам: тёплый белый #FFF8E8 в центре → #FFE7B0 к краю, сильное свечение, без бликов', () => {
    expect(NUR_CENTER_HEX).toBe(0xfff8e8)
    expect(NUR_EDGE_HEX).toBe(0xffe7b0)
    expect(NUR_GLOW).toBeGreaterThanOrEqual(1)
    expect(FIG_FRAG).toContain('mix(NUR_IN, NUR_OUT')
    expect(FIG_EMISSIVE).toContain('totalEmissiveRadiance += fNurC')
    expect(FIG_EMISSIVE).toContain('fNurW')
    expect(FIG_ROUGH).toContain('mix(roughnessFactor, 1., fNurW)')
  })
  it('нур не зависит от освещения сцены: рассеянный цвет под нуром уходит в ноль', () => {
    expect(FIG_FRAG).toContain('fCol *= 1. - fNurW')
    expect(FIG_FRAG).not.toContain('NUR_COL')
  })
  it('край нура мягкий: вес гаснет по овалу лица плавно, а не ступенью', () => {
    expect(FIG_MAIN).toContain('vFigFace = vec2(position.x / NUR_RX')
    expect(FIG_FRAG).toMatch(/fNurW = vFigNur \* \(1\. - smoothstep\(/)
  })
  it('кожа передней полусферы головы (звено 3) становится нуром — плавно, с переходом в кожу или хиджаб', () => {
    expect(FIG_MAIN).toContain('int(aSk.x + .5) == 3')
    expect(FIG_MAIN).toContain('smoothstep(NUR_Z0, NUR_Z1, -position.z)')
    expect(FIG_MAIN).toContain('vFigNur = fNur')
  })
  it('на человека — 8 × vec4 = 32 числа', () => {
    expect(INST_ATTRS).toHaveLength(8)
    expect(INST_STRIDE).toBe(32)
  })
})
