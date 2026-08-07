import { useEffect, useState } from 'react'
import { getRatingsReceived } from '../api'
import { corDaNota, faixaDaNota, formatarNota } from '../lib/labels'
import Avatar from './Avatar'
import { fonts, styles } from '../theme'

// As notas que este jogador recebeu do grupo.
//
// Enquanto a ronda não fechar, mostram-se os VALORES sem os nomes: dá para
// ver que alguém deu 1,2, não dá para saber quem. Quando o último jogador
// entrega, abre — e cada nota passa a ter autor.
//
// A ordem importa e é o que torna isto honesto: se abrisse antes, os
// últimos a votar votavam já a saber o que tinham recebido, e a nota
// deixava de ser uma opinião para passar a ser uma resposta.

function Pastilha({ score, name, photo, revelado }) {
  const cor = corDaNota(score)
  const faixa = faixaDaNota(score)
  return (
    <div
      title={revelado ? `${name}: ${formatarNota(score)} — ${faixa?.titulo}` : faixa?.titulo}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: revelado ? '6px 10px 6px 6px' : '6px 12px',
        borderRadius: 999,
        border: `1px solid ${cor}66`,
        background: `${cor}14`,
      }}
    >
      {revelado && <Avatar name={name} photo={photo} size={26} />}
      {revelado && (
        <span className="pb-truncate" style={{ fontSize: 13, maxWidth: 120 }}>
          {name}
        </span>
      )}
      <span aria-hidden style={{ fontSize: 13 }}>
        {faixa?.emoji}
      </span>
      <span
        style={{
          fontFamily: fonts.title,
          fontSize: 15,
          fontWeight: 700,
          color: cor,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatarNota(score)}
      </span>
    </div>
  )
}

export default function RatingsReceived({ playerId, nome }) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')

  // O `playerId` entra na key do componente (no perfil), por isso trocar de
  // jogador remonta-o e o estado nasce limpo — não é preciso (nem permitido)
  // um setState no corpo do efeito só para o repor.
  useEffect(() => {
    const vivo = { atual: true }
    ;(async () => {
      try {
        const d = await getRatingsReceived(playerId)
        if (vivo.atual) setDados(d)
      } catch (e) {
        // sem a 0027 aplicada a secção simplesmente não aparece, em vez de
        // deitar abaixo o perfil todo
        if (vivo.atual) setErro(e.message)
      }
    })()
    return () => {
      vivo.atual = false
    }
  }, [playerId])

  if (erro || !dados) return null

  const notas = dados.notas || []
  if (!notas.length && !dados.nao_conhecem) return null

  const revelado = Boolean(dados.revelado)

  return (
    <div className="pb-card" style={{ marginTop: 12 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 4,
        }}
      >
        <div style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 14 }}>
          🗳️ Notas recebidas ({notas.length})
        </div>
        {dados.media != null && (
          <span
            style={{
              fontFamily: fonts.title,
              fontSize: 18,
              fontWeight: 700,
              color: corDaNota(dados.media),
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatarNota(dados.media)}
          </span>
        )}
      </div>

      <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 12 }}>
        {revelado ? (
          <>
            A ronda fechou — já se vê quem deu o quê. 🍿
          </>
        ) : (
          <>
            🔒 <strong>Ainda anónimo.</strong> Os nomes aparecem quando o último jogador entregar
            as notas dele.
          </>
        )}
        {dados.nao_conhecem > 0 && (
          <>
            {' '}
            {dados.nao_conhecem}{' '}
            {dados.nao_conhecem === 1 ? 'pessoa não te conhece' : 'pessoas não te conhecem'} o
            suficiente para avaliar — {dados.nao_conhecem === 1 ? 'não entra' : 'não entram'} na
            média.
          </>
        )}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {notas.map((n, i) => (
          <Pastilha
            key={revelado ? `${n.name}-${i}` : i}
            score={n.score}
            name={n.name}
            photo={n.photo}
            revelado={revelado}
          />
        ))}
      </div>

      {!revelado && notas.length > 0 && (
        <p style={{ ...styles.mutedText, fontSize: 11, marginTop: 10 }}>
          Estas são as notas de {nome ? nome.split(' ')[0] : 'este jogador'}, por ordem. Quem as
          deu, para já, é segredo.
        </p>
      )}
    </div>
  )
}
