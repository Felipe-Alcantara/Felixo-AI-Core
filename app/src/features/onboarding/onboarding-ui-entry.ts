/**
 * Ponto de entrada do chunk preguiçoso do tutorial. Os `lazy()` do
 * `OnboardingMount` e da Ajuda importam este módulo, então mensagens, layout,
 * camada, card, anel, aviso e menu viram um chunk só, carregado apenas com tour
 * ou aviso na tela ou com o menu Ajuda aberto.
 */
export { OnboardingTourLayer } from './OnboardingTourLayer'
export { OnboardingHelpMenu } from './OnboardingHelpMenu'
