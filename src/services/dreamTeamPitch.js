import {renderPlayerAvatar} from './playerPhotos.js';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatPoints=value=>Number(value).toLocaleString('nl-NL',{maximumFractionDigits:1});
function renderPitchPlayer(player) {
  if (!player) {
    return ''
  }

  return `
    <article
      class="dreamteam-player dreamteam-player-clickable"
      title="Open profiel van ${escapeHtml(
        player.name,
      )}"
      data-dreamteam-player-id="${escapeHtml(
        player.id,
      )}"
      data-dreamteam-player-season="${escapeHtml(
        player.season,
      )}"
      role="button"
      tabindex="0"
    >
      ${renderPlayerAvatar(player, { size: 48, className: 'dreamteam-player-avatar' })}

      <strong>
        ${escapeHtml(player.name)}
      </strong>

      <span class="dreamteam-player-club">
        ${escapeHtml(player.club)}
      </span>

      <span class="dreamteam-player-points">
        ${formatPoints(
          player.fantasyPoints,
        )} pt
      </span>
    </article>
  `
}


function renderPitchLine(
  players,
  className,
) {
  return `
    <div class="dreamteam-line ${className}">
      ${players
        .map(
          renderPitchPlayer,
        )
        .join('')}
    </div>
  `
}


/* =========================================================
   VELD
========================================================= */

export function renderPitch(team) {
  if (!team?.valid) {
    return `
      <div class="dreamteam-empty">
        <strong>
          Nog geen volledig Dream Team beschikbaar
        </strong>

        <p>
          ${escapeHtml(
            team?.message ||
            'Er is nog onvoldoende afgeronde wedstrijddata.',
          )}
        </p>
      </div>
    `
  }

  return `
    <div class="dreamteam-pitch">
      <div class="dreamteam-pitch-markings">
        <div class="dreamteam-box dreamteam-box-top"></div>
        <div class="dreamteam-center-line"></div>
        <div class="dreamteam-center-circle"></div>
        <div class="dreamteam-box dreamteam-box-bottom"></div>
      </div>

      <div class="dreamteam-pitch-content">
        ${renderPitchLine(
          team.positions.attackers,
          'dreamteam-line-attack',
        )}

        ${renderPitchLine(
          team.positions.midfielders,
          'dreamteam-line-midfield',
        )}

        ${renderPitchLine(
          team.positions.defenders,
          'dreamteam-line-defense',
        )}

        ${renderPitchLine(
          team.positions.keeper,
          'dreamteam-line-keeper',
        )}
      </div>
    </div>
  `
}
