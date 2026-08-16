import { configure } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

/**
 * O limite por omissão de `findBy*` é 1 segundo, contado em tempo real e não em
 * trabalho feito. Com a suite inteira a correr em paralelo, uma asserção que
 * espera por uma consulta resolvida passava isolada e falhava em conjunto — o
 * `NotificationBell` levou 1271 ms para o mesmo teste que sozinho leva 600 ms.
 *
 * Subir o limite não enfraquece asserção nenhuma: um teste que passa continua a
 * passar à mesma velocidade, e só os que falham demoram mais a dizê-lo. O que
 * evita é um vermelho que depende da carga da máquina, que ensina a ignorar o
 * CI em vez de o levar a sério.
 */
configure({ asyncUtilTimeout: 5000 })
