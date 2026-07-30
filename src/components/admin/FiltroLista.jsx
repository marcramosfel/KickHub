import { useMemo, useState } from 'react'
import { colors, fonts, styles } from '../../theme'

// Barra de pesquisa + ordenação das listas do painel.
//
// O plantel já vai em ~30 jogadores e as rodadas só crescem: encontrar uma
// pessoa a rolar deixou de ser viável. Como as três listas (plantel, rodadas,
// acessos) precisam do mesmo, a barra vive aqui — e a filtragem também, para
// nenhuma delas inventar o seu próprio "contém".

// Sem acentos e em minúsculas: procurar "savio" tem de encontrar "Sávio".
// O intervalo é o dos diacríticos que o `normalize('NFD')` separa das
// letras, escrito com escapes — os caracteres combinantes literais não
// sobrevivem a uma cópia de ficheiro entre editores.
export const normalizar = (v) =>
  String(v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

// Filtra por um termo sobre os campos que `campos(item)` devolver.
export function filtrar(lista, termo, campos) {
  const t = normalizar(termo).trim()
  if (!t) return lista || []
  return (lista || []).filter((item) =>
    campos(item)
      .filter(Boolean)
      .some((c) => normalizar(c).includes(t))
  )
}

// `ordens`: [{ id, rotulo, comparar }]. `null` = sem ordenação escolhida.
export function useFiltro({ lista, campos, ordens = [], ordemInicial = null }) {
  const [termo, setTermo] = useState('')
  const [ordemId, setOrdemId] = useState(ordemInicial ?? ordens[0]?.id ?? null)

  const resultado = useMemo(() => {
    const filtrada = filtrar(lista, termo, campos)
    const ordem = ordens.find((o) => o.id === ordemId)
    // `toSorted` ainda não está em todo o lado; a cópia evita mexer na lista
    // original (que noutros sítios alimenta contagens e efeitos)
    return ordem?.comparar ? [...filtrada].sort(ordem.comparar) : filtrada
  }, [lista, termo, campos, ordens, ordemId])

  return { termo, setTermo, ordemId, setOrdemId, resultado }
}

export default function FiltroLista({
  id,
  termo,
  onTermo,
  ordens = [],
  ordemId,
  onOrdem,
  total,
  visiveis,
  rotuloSingular = 'resultado',
  rotuloPlural = 'resultados',
  placeholder = 'Procurar…',
  extra,
}) {
  const filtrado = termo.trim().length > 0
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
          <label htmlFor={id} style={{ ...styles.label, marginBottom: 4 }}>
            {placeholder}
          </label>
          <input
            id={id}
            type="search"
            value={termo}
            onChange={(e) => onTermo(e.target.value)}
            placeholder={placeholder}
            style={{ ...styles.input, minHeight: 44 }}
          />
        </div>
        {extra}
      </div>

      {ordens.length > 1 && (
        <div
          role="radiogroup"
          aria-label="Ordenar por"
          style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}
        >
          <span style={{ ...styles.mutedText, fontSize: 12, alignSelf: 'center', marginRight: 2 }}>
            Ordenar:
          </span>
          {ordens.map((o) => {
            const ativa = o.id === ordemId
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={ativa}
                onClick={() => onOrdem(o.id)}
                className="pb-tab"
                style={{
                  fontSize: 12,
                  minHeight: 36,
                  padding: '6px 10px',
                  background: ativa ? 'rgba(52,208,88,0.14)' : 'transparent',
                  color: ativa ? colors.text : colors.muted,
                }}
              >
                {o.rotulo}
              </button>
            )
          })}
        </div>
      )}

      <p
        // `role="status"` para quem usa leitor de ecrã ouvir a contagem mudar
        // ao escrever — sem isto a filtragem é invisível para eles.
        role="status"
        style={{
          ...styles.mutedText,
          fontSize: 12,
          marginTop: 8,
          fontFamily: fonts.body,
        }}
      >
        {filtrado
          ? `${visiveis} de ${total} ${visiveis === 1 ? rotuloSingular : rotuloPlural}`
          : `${total} ${total === 1 ? rotuloSingular : rotuloPlural}`}
      </p>
    </div>
  )
}
