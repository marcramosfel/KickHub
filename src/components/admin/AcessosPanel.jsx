import { useState } from 'react'
import {
  adminExport,
  adminRegenUserId,
  adminRevokeDevices,
  adminSetPin,
  adminSetUserId,
} from '../../api'
import { formatDia, hojeLocal } from '../../lib/format'
import { APP_NAME } from '../../config'
import FiltroLista, { useFiltro } from './FiltroLista'
import { colors, fonts, styles } from '../../theme'

// Acessos: o ID de entrada de cada jogador, o PIN e o backup dos dados.
//
// Tudo aqui é destrutivo ou sensível (regenerar um ID tira o login a alguém,
// definir um PIN novo invalida o antigo), por isso cada ação confirma antes.
// O backup vive nesta aba por ser a única que fala com o adminExport.

const ORDENS = [
  {
    id: 'nome',
    rotulo: 'Nome',
    comparar: (a, b) => a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }),
  },
  {
    id: 'id',
    rotulo: 'ID',
    comparar: (a, b) => String(a.user_id || '').localeCompare(String(b.user_id || '')),
  },
]

const CAMPOS = (u) => [u.name, u.user_id]

export default function AcessosPanel({ pw, users = [], usersErr, busy, onAcao, onErro, onBusy }) {
  const [copiedId, setCopiedId] = useState(null)
  const [copiedList, setCopiedList] = useState(false)
  const [novoPin, setNovoPin] = useState(null)
  const [copiedAcesso, setCopiedAcesso] = useState(false)
  const filtroAcessos = useFiltro({ lista: users, campos: CAMPOS, ordens: ORDENS })

  const copiarTexto = async (texto, onOk) => {
    try {
      await navigator.clipboard.writeText(texto)
      onOk?.()
    } catch {
      window.prompt('Copia manualmente:', texto)
    }
  }

  const copiarId = (u) =>
    copiarTexto(u.user_id, () => {
      setCopiedId(u.user_id)
      setTimeout(() => setCopiedId(null), 1600)
    })

  const copiarLista = () =>
    copiarTexto(users.map((u) => `${u.name} — ${u.user_id}`).join('\n'), () => {
      setCopiedList(true)
      setTimeout(() => setCopiedList(false), 1800)
    })

  const regenerarId = (u) => {
    if (
      !window.confirm(
        `Regenerar o ID de ${u.name}? O ID atual (${u.user_id}) deixa de servir para o login.`
      )
    )
      return
    onAcao(() => adminRegenUserId(pw, u.id))
  }

  // "Terminar sessões": revoga os tokens do "lembrar-me neste telemóvel".
  //
  // O token autoriza ler e votar sem PIN — é o que faz o link do WhatsApp
  // abrir direto na cédula. Se alguém perder o telemóvel, ou emprestar e se
  // arrepender, tem de haver forma de fechar essa porta sem trocar o PIN.
  const revogarSessoes = (u) => {
    if (
      !window.confirm(
        `Terminar as sessões guardadas de ${u.name}? Nos telemóveis onde ele marcou ` +
          '"lembrar-me", passa a ser pedido o PIN outra vez. O PIN não muda.'
      )
    )
      return
    onAcao(() => adminRevokeDevices(pw, u.id))
  }

  // define um PIN novo para quem se esqueceu do seu (o antigo não é preciso)
  const definirPin = (u) => {
    const sugestao = String(1000 + Math.floor(Math.random() * 9000))
    const novo = window.prompt(
      `Novo PIN de 4 dígitos para ${u.name} (sugestão gerada; podes escrever outro):`,
      sugestao
    )
    if (novo == null) return
    const limpo = novo.trim()
    if (!/^\d{4}$/.test(limpo)) {
      onErro('O PIN tem de ter exatamente 4 dígitos.')
      return
    }
    if (!window.confirm(`Definir o PIN de ${u.name} como ${limpo}? O PIN antigo deixa de servir.`))
      return
    setNovoPin(null)
    onAcao(async () => {
      await adminSetPin(pw, u.id, limpo)
      setNovoPin({ id: u.id, name: u.name, userId: u.user_id, pin: limpo })
    })
  }

  // mensagem pronta a mandar à pessoa
  const copiarAcesso = () => {
    if (!novoPin) return
    copiarTexto(
      `Olá ${novoPin.name}! Acesso à ${APP_NAME.main} ${APP_NAME.accent}:\n` +
        `ID: ${novoPin.userId || novoPin.name}\nPIN: ${novoPin.pin}\n` +
        `Podes trocá-lo por um teu na tua página (🔑 Mudar PIN).`,
      () => {
        setCopiedAcesso(true)
        setTimeout(() => setCopiedAcesso(false), 1800)
      }
    )
  }

  const editarId = (u) => {
    const novo = window.prompt(
      `Novo ID para ${u.name} (letras e números; será normalizado):`,
      u.user_id
    )
    if (novo == null) return
    if (!window.confirm(`Mudar o ID de ${u.name} para "${novo}"? Passará a entrar com o novo ID.`))
      return
    onAcao(() => adminSetUserId(pw, u.id, novo))
  }

  // descarrega um snapshot dos dados em JSON (backup)
  const exportarDados = async (comFotos) => {
    onErro('')
    onBusy(true)
    try {
      const dump = await adminExport(pw, comFotos)
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pelada-browns-backup-${hojeLocal()}${comFotos ? '-com-fotos' : ''}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      onErro(err.message)
    } finally {
      onBusy(false)
    }
  }

  return (

    <div>
      {usersErr && (
        <div style={{ ...styles.panel, marginBottom: 12 }}>
          <p style={{ ...styles.mutedText, fontSize: 13 }}>
            ⚠️ Não consegui carregar os utilizadores ({usersErr}). Se ainda não correste o{' '}
            <strong>supabase/migrations/esquema.sql</strong> no SQL Editor do Supabase, é isso
            que falta.
          </p>
        </div>
      )}

      {!usersErr && (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
              gap: 10,
            }}
          >
            <span style={{ ...styles.mutedText, fontSize: 13 }}>
              Acessos do grupo
            </span>
            <button
              onClick={copiarLista}
              disabled={!users.length}
              style={{
                ...styles.buttonGhost,
                width: 'auto',
                padding: '9px 14px',
                fontSize: 13,
                color: copiedList ? colors.grass : colors.text,
                borderColor: copiedList ? colors.grass : colors.line,
              }}
            >
              {copiedList ? 'Lista copiada ✓' : '📋 Copiar lista (nome — ID)'}
            </button>
          </div>

          {users.length === 0 && (
            <div style={{ ...styles.panel, textAlign: 'center', padding: 22 }}>
              <p style={styles.mutedText}>Ainda não há utilizadores.</p>
            </div>
          )}

          {users.length > 0 && (
            <FiltroLista
              id="procura-acessos"
              termo={filtroAcessos.termo}
              onTermo={filtroAcessos.setTermo}
              ordens={ORDENS}
              ordemId={filtroAcessos.ordemId}
              onOrdem={filtroAcessos.setOrdemId}
              total={users.length}
              visiveis={filtroAcessos.resultado.length}
              rotuloSingular="utilizador"
              rotuloPlural="utilizadores"
              placeholder="Procurar por nome ou ID"
            />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtroAcessos.resultado.length === 0 && users.length > 0 && (
              <p style={{ ...styles.mutedText, textAlign: 'center', padding: 14 }}>
                Ninguém corresponde a “{filtroAcessos.termo}”.
              </p>
            )}
            {filtroAcessos.resultado.map((u) => (
              <div key={u.id} style={{ ...styles.panel, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{u.name}</span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: u.approved
                            ? 'rgba(52,208,88,0.12)'
                            : 'rgba(255,197,49,0.12)',
                          color: u.approved ? colors.grass : colors.teamA,
                        }}
                      >
                        {u.approved ? 'aprovado' : 'pendente'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                      registado a {formatDia(u.created_at)}
                    </div>
                  </div>
                </div>

                {/* ID + copiar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 10,
                    background: '#0C1915',
                    border: `1px solid ${colors.line}`,
                    borderRadius: 10,
                    padding: '7px 10px',
                  }}
                >
                  <code
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: 14,
                      fontWeight: 700,
                      color: colors.grass,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {u.user_id}
                  </code>
                  <button
                    onClick={() => copiarId(u)}
                    aria-label={`Copiar ID de ${u.name}`}
                    style={{
                      ...styles.link,
                      color: copiedId === u.user_id ? colors.grass : colors.text,
                      flexShrink: 0,
                    }}
                  >
                    {copiedId === u.user_id ? 'Copiado ✓' : 'Copiar'}
                  </button>
                </div>

                {/* ações */}
                <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => editarId(u)}
                    disabled={busy}
                    style={{ ...styles.link, color: colors.teamA }}
                  >
                    ✎ Editar ID
                  </button>
                  <button
                    onClick={() => regenerarId(u)}
                    disabled={busy}
                    style={styles.link}
                  >
                    ↻ Regenerar
                  </button>
                  <button
                    onClick={() => revogarSessoes(u)}
                    disabled={busy}
                    style={styles.link}
                    title="Revoga o 'lembrar-me neste telemóvel'. O PIN não muda."
                  >
                    📵 Terminar sessões
                  </button>
                  <button
                    onClick={() => definirPin(u)}
                    disabled={busy}
                    style={{ ...styles.link, color: colors.grass }}
                  >
                    🔑 Definir novo PIN
                  </button>
                </div>

                {/* PIN acabado de definir para este jogador */}
                {novoPin?.id === u.id && (
                  <div
                    style={{
                      marginTop: 10,
                      border: `1px solid ${colors.grass}`,
                      borderRadius: 10,
                      padding: 10,
                      background: 'rgba(52,208,88,0.07)',
                    }}
                  >
                    <div style={{ fontSize: 13, marginBottom: 6 }}>
                      PIN novo de {novoPin.name}:{' '}
                      <strong
                        style={{
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          fontSize: 18,
                          color: colors.grass,
                          letterSpacing: 2,
                        }}
                      >
                        {novoPin.pin}
                      </strong>
                    </div>
                    <p style={{ ...styles.mutedText, fontSize: 11, marginBottom: 8 }}>
                      Passa-lho em privado — depois de saíres desta página não o consegues ver
                      outra vez (fica só o hash na base de dados).
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={copiarAcesso}
                        style={{
                          ...styles.buttonGhost,
                          width: 'auto',
                          padding: '8px 12px',
                          fontSize: 13,
                          color: copiedAcesso ? colors.grass : colors.text,
                          borderColor: copiedAcesso ? colors.grass : colors.line,
                        }}
                      >
                        {copiedAcesso ? 'Mensagem copiada ✓' : '📋 Copiar mensagem'}
                      </button>
                      <button
                        onClick={() => setNovoPin(null)}
                        style={{
                          ...styles.buttonGhost,
                          width: 'auto',
                          padding: '8px 12px',
                          fontSize: 13,
                        }}
                      >
                        Esconder
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 12 }}>
            O ID serve para o jogador entrar (além do nome). Editar/regenerar muda como ele
            faz login — usa só quando preciso. “Definir novo PIN” é para quem se esqueceu do
            seu: defines um, passas-lho, e ele troca-o depois na página dele.
          </p>
        </>
      )}

      {/* backup / exportação */}
      <div style={{ ...styles.panel, padding: 12, marginTop: 18 }}>
        <div style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15, marginBottom: 6 }}>
          💾 Backup dos dados
        </div>
        <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 10 }}>
          Descarrega um ficheiro JSON com jogadores, avaliações, rodadas e votos. Guarda-o de
          vez em quando — é a tua rede de segurança.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => exportarDados(false)}
            disabled={busy}
            style={{ ...styles.buttonGhost, fontSize: 13 }}
          >
            ⬇️ Exportar (leve)
          </button>
          <button
            onClick={() => exportarDados(true)}
            disabled={busy}
            style={{ ...styles.buttonGhost, fontSize: 13 }}
          >
            🖼️ Com fotos
          </button>
        </div>
        <p style={{ ...styles.mutedText, fontSize: 11, marginTop: 8 }}>
          O “leve” não inclui fotos (ficheiro pequeno). Por segurança, os PINs nunca são
          exportados.
        </p>
      </div>
    </div>
  )
}
