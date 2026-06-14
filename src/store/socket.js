import { createClient } from "@supabase/supabase-js";

let supabase;
function getSupabase() {
  if (!supabase) {
    const url = process.env.VUE_APP_SUPABASE_URL;
    const key = process.env.VUE_APP_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing Supabase config. Set VUE_APP_SUPABASE_URL and VUE_APP_SUPABASE_ANON_KEY."
      );
    }
    supabase = createClient(url, key);
  }
  return supabase;
}

class LiveSession {
  constructor(store) {
    this._store = store;
    this._channel = null;
    this._isSpectator = true;
    this._gamestate = [];

    if (this._store.state.session.sessionId) {
      this.connect(this._store.state.session.sessionId);
    }
  }

  /**
   * Broadcast a message to all channel subscribers.
   */
  async _send(event, payload = null) {
    if (!this._channel) return;
    const { error } = await this._channel.send({ type: "broadcast", event, payload });
    if (error && process.env.NODE_ENV !== "production") {
      console.warn(`[socket] send "${event}" failed:`, error);
    }
  }

  /**
   * Send a message to a specific player, or broadcast if no playerId given.
   */
  _sendDirect(playerId, event, payload) {
    if (playerId) {
      this._send("direct", { target: playerId, event, payload });
    } else {
      this._send(event, payload);
    }
  }

  /**
   * Subscribe to a Supabase Realtime channel for the given session.
   */
  _open(channelId) {
    this.disconnect();

    this._channel = getSupabase().channel("game:" + channelId, {
      config: { broadcast: { self: false } }
    });

    this._channel
      // Targeted direct messages
      .on("broadcast", { event: "direct" }, ({ payload }) => {
        this._handleDirect(payload);
      })
      // Broadcast messages (host → all spectators)
      .on("broadcast", { event: "edition" }, ({ payload }) => {
        this._updateEdition(payload);
      })
      .on("broadcast", { event: "fabled" }, ({ payload }) => {
        this._updateFabled(payload);
      })
      .on("broadcast", { event: "gs" }, ({ payload }) => {
        this._updateGamestate(payload);
      })
      .on("broadcast", { event: "player" }, ({ payload }) => {
        this._updatePlayer(payload);
      })
      .on("broadcast", { event: "claim" }, ({ payload }) => {
        this._updateSeat(payload);
      })
      .on("broadcast", { event: "nomination" }, ({ payload }) => {
        if (!this._isSpectator) return;
        if (!payload) {
          this._store.commit(
            "session/addHistory",
            this._store.state.players.players
          );
        }
        this._store.commit("session/nomination", { nomination: payload });
        if (payload && Array.isArray(payload)) {
          this._store.commit("session/trackNomination", payload);
        }
      })
      .on("broadcast", { event: "dayStart" }, () => {
        if (!this._isSpectator) return;
        this._store.commit("session/resetNominations");
      })
      .on("broadcast", { event: "gachaStart" }, () => {
        if (!this._isSpectator) return;
        this._store.state.players.players.forEach(player => {
          if (player.role && player.role.id) {
            this._store.commit("players/update", { player, property: "role", value: {} });
          }
        });
        this._store.commit("session/setGachaMode", true);
      })
      .on("broadcast", { event: "gachaEnd" }, () => {
        if (!this._isSpectator) return;
        this._store.commit("session/setGachaMode", false);
      })
      .on("broadcast", { event: "swap" }, ({ payload }) => {
        if (!this._isSpectator) return;
        this._store.commit("players/swap", payload);
      })
      .on("broadcast", { event: "move" }, ({ payload }) => {
        if (!this._isSpectator) return;
        this._store.commit("players/move", payload);
      })
      .on("broadcast", { event: "remove" }, ({ payload }) => {
        if (!this._isSpectator) return;
        this._store.commit("players/remove", payload);
      })
      .on("broadcast", { event: "marked" }, ({ payload }) => {
        if (!this._isSpectator) return;
        this._store.commit("session/setMarkedPlayer", payload);
      })
      .on("broadcast", { event: "isNight" }, ({ payload }) => {
        if (!this._isSpectator) return;
        this._store.commit("toggleNight", payload);
      })
      .on("broadcast", { event: "isVoteHistoryAllowed" }, ({ payload }) => {
        if (!this._isSpectator) return;
        this._store.commit("session/setVoteHistoryAllowed", payload);
        this._store.commit("session/clearVoteHistory");
      })
      .on("broadcast", { event: "votingSpeed" }, ({ payload }) => {
        if (!this._isSpectator) return;
        this._store.commit("session/setVotingSpeed", payload);
      })
      .on("broadcast", { event: "clearVoteHistory" }, () => {
        if (!this._isSpectator) return;
        this._store.commit("session/clearVoteHistory");
      })
      .on("broadcast", { event: "isVoteInProgress" }, ({ payload }) => {
        if (!this._isSpectator) return;
        this._store.commit("session/setVoteInProgress", payload);
      })
      .on("broadcast", { event: "vote" }, ({ payload }) => {
        this._handleVote(payload);
      })
      .on("broadcast", { event: "lock" }, ({ payload }) => {
        this._handleLock(payload);
      })
      .on("broadcast", { event: "pronouns" }, ({ payload }) => {
        this._updatePlayerPronouns(payload);
      })
      // Presence: track connected players for player count
      .on("presence", { event: "sync" }, () => {
        const count = Object.values(this._channel.presenceState())
          .flat()
          .filter(p => !p.isHost).length;
        this._store.commit("session/setPlayerCount", count);
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        if (this._isSpectator) return;
        leftPresences.forEach(({ playerId }) => {
          if (playerId) this._handleBye(playerId);
        });
      })
      .subscribe(async status => {
        if (status === "SUBSCRIBED") {
          this._store.commit("session/setReconnecting", false);
          try {
            await this._channel.track({
              playerId: this._store.state.session.playerId,
              isHost: !this._isSpectator
            });
          } catch (err) {
            if (process.env.NODE_ENV !== "production") {
              console.warn("[socket] presence track failed:", err);
            }
          }
          if (this._isSpectator) {
            // Ask host for current gamestate
            this._sendDirect(
              "host",
              "getGamestate",
              this._store.state.session.playerId
            );
          } else {
            this.sendGamestate();
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          this._store.commit("session/setReconnecting", true);
        } else if (status === "CLOSED") {
          this._store.commit("session/setReconnecting", false);
        }
      });
  }

  /**
   * Connect to a session channel.
   */
  connect(channel) {
    if (!this._store.state.session.playerId) {
      this._store.commit(
        "session/setPlayerId",
        crypto.randomUUID()
      );
    }
    this._store.commit("session/setPlayerCount", 0);
    this._store.commit("session/setPing", 0);
    this._isSpectator = this._store.state.session.isSpectator;
    this._open(channel);
  }

  /**
   * Disconnect from the current session.
   */
  async disconnect() {
    this._store.commit("session/setPlayerCount", 0);
    this._store.commit("session/setPing", 0);
    this._store.commit("session/setReconnecting", false);
    if (this._channel) {
      if (this._isSpectator) {
        await this._sendDirect(
          "host",
          "bye",
          this._store.state.session.playerId
        );
      }
      getSupabase().removeChannel(this._channel);
      this._channel = null;
    }
  }

  /**
   * Route an incoming direct message to the right handler.
   * Format: { target: playerId|'host', event, payload }
   */
  _handleDirect({ target, event, payload }) {
    const myId = this._isSpectator
      ? this._store.state.session.playerId
      : "host";
    if (target !== myId) return;
    switch (event) {
      case "getGamestate":
        this.sendGamestate(payload);
        break;
      case "gs":
        this._updateGamestate(payload);
        break;
      case "edition":
        this._updateEdition(payload);
        break;
      case "player":
        this._updatePlayer(payload);
        break;
      case "bye":
        this._handleBye(payload);
        break;
      case "gachaRole":
        this._handleGachaReceive(payload);
        break;
      case "requestGacha":
        this._handleGachaRequest(payload);
        break;
      case "bluffs":
        this._handleBluffsReceive(payload);
        break;
    }
  }

  /**
   * Publish the current gamestate. ST only.
   * @param playerId send directly to this player, or broadcast if empty
   * @param isLightweight only send player list (no edition/state)
   */
  sendGamestate(playerId = "", isLightweight = false) {
    if (this._isSpectator) return;
    this._gamestate = this._store.state.players.players.map(player => ({
      name: player.name,
      id: player.id,
      isDead: player.isDead,
      isVoteless: player.isVoteless,
      pronouns: player.pronouns,
      ...(player.role && player.role.team === "traveler"
        ? { roleId: player.role.id }
        : {})
    }));
    if (isLightweight) {
      this._sendDirect(playerId, "gs", {
        gamestate: this._gamestate,
        isLightweight
      });
    } else {
      const { session, grimoire } = this._store.state;
      const { fabled } = this._store.state.players;
      this.sendEdition(playerId);
      this._sendDirect(playerId, "gs", {
        gamestate: this._gamestate,
        isNight: grimoire.isNight,
        isVoteHistoryAllowed: session.isVoteHistoryAllowed,
        nomination: session.nomination,
        votingSpeed: session.votingSpeed,
        lockedVote: session.lockedVote,
        isVoteInProgress: session.isVoteInProgress,
        markedPlayer: session.markedPlayer,
        fabled: fabled.map(f => (f.isCustom ? f : { id: f.id })),
        isGachaMode: session.isGachaMode,
        ...(session.nomination ? { votes: session.votes } : {})
      });
    }
  }

  /**
   * Apply an incoming gamestate update. Spectator only.
   */
  _updateGamestate(data) {
    if (!this._isSpectator) return;
    const {
      gamestate,
      isLightweight,
      isNight,
      isVoteHistoryAllowed,
      nomination,
      votingSpeed,
      votes,
      lockedVote,
      isVoteInProgress,
      markedPlayer,
      fabled,
      isGachaMode
    } = data;
    const players = this._store.state.players.players;
    if (players.length < gamestate.length) {
      for (let x = players.length; x < gamestate.length; x++) {
        this._store.commit("players/add", gamestate[x].name);
      }
    } else if (players.length > gamestate.length) {
      for (let x = players.length; x > gamestate.length; x--) {
        this._store.commit("players/remove", x - 1);
      }
    }
    gamestate.forEach((state, x) => {
      const player = players[x];
      const { roleId } = state;
      ["name", "id", "isDead", "isVoteless", "pronouns"].forEach(property => {
        const value = state[property];
        if (player[property] !== value) {
          this._store.commit("players/update", { player, property, value });
        }
      });
      if (roleId && player.role.id !== roleId) {
        const role =
          this._store.state.roles.get(roleId) ||
          this._store.getters.rolesJSONbyId.get(roleId);
        if (role) {
          this._store.commit("players/update", {
            player,
            property: "role",
            value: role
          });
        }
      } else if (!roleId && player.role.team === "traveler") {
        this._store.commit("players/update", {
          player,
          property: "role",
          value: {}
        });
      }
    });
    if (!isLightweight) {
      this._store.commit("toggleNight", !!isNight);
      this._store.commit("session/setVoteHistoryAllowed", isVoteHistoryAllowed);
      this._store.commit("session/nomination", {
        nomination,
        votes,
        votingSpeed,
        lockedVote,
        isVoteInProgress
      });
      this._store.commit("session/setMarkedPlayer", markedPlayer);
      this._store.commit("players/setFabled", {
        fabled: fabled.map(f => this._store.state.fabled.get(f.id) || f)
      });
      if (typeof isGachaMode !== "undefined") {
        this._store.commit("session/setGachaMode", isGachaMode);
      }
    }
  }

  /**
   * Publish edition and roles. ST only.
   */
  sendEdition(playerId = "") {
    if (this._isSpectator) return;
    const { edition } = this._store.state;
    let roles;
    if (!edition.isOfficial) {
      roles = this._store.getters.customRolesStripped;
    }
    this._sendDirect(playerId, "edition", {
      edition: edition.isOfficial ? { id: edition.id } : edition,
      ...(roles ? { roles } : {})
    });
  }

  /**
   * Apply incoming edition/roles update. Spectator only.
   */
  _updateEdition({ edition, roles }) {
    if (!this._isSpectator) return;
    this._store.commit("setEdition", edition);
    if (roles) {
      this._store.commit("setCustomRoles", roles);
      if (this._store.state.roles.size !== roles.length) {
        const missing = [];
        roles.forEach(({ id }) => {
          if (!this._store.state.roles.get(id)) {
            missing.push(id);
          }
        });
        alert(
          `This session contains custom characters that can't be found. ` +
            `Please load them before joining! ` +
            `Missing roles: ${missing.join(", ")}`
        );
        this.disconnect();
        this._store.commit("toggleModal", "edition");
      }
    }
  }

  /**
   * Publish fabled list update. ST only.
   */
  sendFabled() {
    if (this._isSpectator) return;
    const { fabled } = this._store.state.players;
    this._send("fabled", fabled.map(f => (f.isCustom ? f : { id: f.id })));
  }

  _updateFabled(fabled) {
    if (!this._isSpectator) return;
    this._store.commit("players/setFabled", {
      fabled: fabled.map(f => this._store.state.fabled.get(f.id) || f)
    });
  }

  /**
   * Publish a single player property update. ST only.
   */
  sendPlayer({ player, property, value }) {
    if (this._isSpectator || property === "reminders") return;
    const index = this._store.state.players.players.indexOf(player);
    if (index < 0) return;
    while (this._gamestate.length <= index) this._gamestate.push({});
    if (property === "role") {
      if (value.team && value.team === "traveler") {
        this._gamestate[index].roleId = value.id;
        this._send("player", { index, property, value: value.id });
      } else if (this._gamestate[index].roleId) {
        delete this._gamestate[index].roleId;
        this._send("player", { index, property, value: "" });
      }
    } else {
      this._send("player", { index, property, value });
    }
  }

  /**
   * Apply an incoming player property update. Spectator only.
   */
  _updatePlayer({ index, property, value }) {
    if (!this._isSpectator) return;
    const player = this._store.state.players.players[index];
    if (!player) return;
    if (property === "role") {
      if (!value && player.role.team === "traveler") {
        this._store.commit("players/update", {
          player,
          property: "role",
          value: {}
        });
      } else {
        const role =
          this._store.state.roles.get(value) ||
          this._store.getters.rolesJSONbyId.get(value) ||
          {};
        this._store.commit("players/update", {
          player,
          property: "role",
          value: role
        });
      }
    } else {
      this._store.commit("players/update", { player, property, value });
    }
  }

  /**
   * Publish a pronouns update. Seated player or ST only.
   */
  sendPlayerPronouns({ player, value, isFromSockets }) {
    if (
      isFromSockets ||
      (this._isSpectator &&
        this._store.state.session.playerId !== player.id)
    )
      return;
    const index = this._store.state.players.players.indexOf(player);
    this._send("pronouns", [index, value]);
  }

  _updatePlayerPronouns([index, value]) {
    const player = this._store.state.players.players[index];
    this._store.commit("players/update", {
      player,
      property: "pronouns",
      value,
      isFromSockets: true
    });
  }

  /**
   * Handle a player leaving: clear their claimed seat. ST only.
   */
  _handleBye(playerId) {
    if (this._isSpectator) return;
    this._store.state.players.players.forEach(player => {
      if (player.id === playerId) {
        this._store.commit("players/update", {
          player,
          property: "id",
          value: ""
        });
      }
    });
  }

  /**
   * Claim a seat in the session. Spectator only.
   */
  claimSeat(seat) {
    if (!this._isSpectator) return;
    const players = this._store.state.players.players;
    if (players.length > seat && (seat < 0 || !players[seat].id)) {
      this._send("claim", [seat, this._store.state.session.playerId]);
    }
  }

  _updateSeat([index, value]) {
    if (this._isSpectator) return;
    const property = "id";
    const players = this._store.state.players.players;
    const oldIndex = players.findIndex(({ id }) => id === value);
    if (oldIndex >= 0 && oldIndex !== index) {
      this._store.commit("players/update", {
        player: players[oldIndex],
        property,
        value: ""
      });
    }
    if (index >= 0) {
      const player = players[index];
      if (!player) return;
      this._store.commit("players/update", { player, property, value });
    }
  }

  /**
   * Send each seated player their own role directly. ST only.
   */
  distributeRoles() {
    if (this._isSpectator) return;
    this._store.state.players.players.forEach((player, index) => {
      if (player.id && player.role) {
        this._sendDirect(player.id, "player", {
          index,
          property: "role",
          value: player.role.id
        });
      }
    });
  }

  distributeBluffsToDemon(demonPlayerId) {
    if (this._isSpectator || !demonPlayerId) return;
    const bluffs = this._store.state.players.bluffs;
    const bluffIds = bluffs.filter(b => b && b.id).map(b => b.id);
    if (!bluffIds.length) return;
    this._sendDirect(demonPlayerId, "bluffs", bluffIds);
  }

  _handleBluffsReceive(bluffIds) {
    if (!this._isSpectator) return;
    this._store.commit("players/setBluff");
    bluffIds.forEach((roleId, index) => {
      const role =
        this._store.state.roles.get(roleId) ||
        this._store.getters.rolesJSONbyId.get(roleId);
      if (role) {
        this._store.commit("players/setBluff", { index, role });
      }
    });
  }

  broadcastGachaStart() {
    if (this._isSpectator) return;
    this._send("gachaStart");
  }

  requestGacha() {
    if (!this._isSpectator) return;
    this._sendDirect("host", "requestGacha", this._store.state.session.playerId);
  }

  _handleGachaRequest(playerId) {
    if (this._isSpectator) return;
    const pool = this._store.state.session.gachaPool;
    if (!pool.length) return;
    const roleId = pool[0];
    this._store.commit("session/popGachaRole");
    const players = this._store.state.players.players;
    const index = players.findIndex(p => p.id === playerId);
    if (index < 0) return;
    const role =
      this._store.state.roles.get(roleId) ||
      this._store.getters.rolesJSONbyId.get(roleId) ||
      {};
    this._store.commit("players/update", { player: players[index], property: "role", value: role });
    this._sendDirect(playerId, "gachaRole", { index, roleId });
    if (this._store.state.session.gachaPool.length === 0) {
      this._store.commit("session/setGachaMode", false);
      this._send("gachaEnd");
    }
  }

  _handleGachaReceive({ index, roleId }) {
    const role =
      this._store.state.roles.get(roleId) ||
      this._store.getters.rolesJSONbyId.get(roleId) ||
      {};
    const player = this._store.state.players.players[index];
    if (player) {
      this._store.commit("players/update", { player, property: "role", value: role });
    }
    this._store.commit("session/setGachaMode", false);
  }

  /**
   * Broadcast a nomination. ST only.
   */
  nomination(payload) {
    if (this._isSpectator) return;
    const nomination = payload ? payload.nomination || payload : payload;
    const players = this._store.state.players.players;
    if (
      !nomination ||
      (players.length > nomination[0] && players.length > nomination[1])
    ) {
      this.setVotingSpeed(this._store.state.session.votingSpeed);
      this._send("nomination", nomination);
    }
  }

  setVoteInProgress() {
    if (this._isSpectator) return;
    this._send(
      "isVoteInProgress",
      this._store.state.session.isVoteInProgress
    );
  }

  setIsNight() {
    if (this._isSpectator) return;
    const isNight = this._store.state.grimoire.isNight;
    this._send("isNight", isNight);
    if (!isNight) {
      this._send("dayStart");
    }
  }

  setVoteHistoryAllowed() {
    if (this._isSpectator) return;
    this._send(
      "isVoteHistoryAllowed",
      this._store.state.session.isVoteHistoryAllowed
    );
  }

  setVotingSpeed(votingSpeed) {
    if (this._isSpectator) return;
    if (votingSpeed) {
      this._send("votingSpeed", votingSpeed);
    }
  }

  setMarked(playerIndex) {
    if (this._isSpectator) return;
    this._send("marked", playerIndex);
  }

  clearVoteHistory() {
    if (this._isSpectator) return;
    this._send("clearVoteHistory");
  }

  /**
   * Send a vote. Player or ST.
   */
  vote([index]) {
    const player = this._store.state.players.players[index];
    if (
      this._store.state.session.playerId === player.id ||
      !this._isSpectator
    ) {
      this._send("vote", [
        index,
        this._store.state.session.votes[index],
        !this._isSpectator
      ]);
    }
  }

  _handleVote([index, vote, fromST]) {
    const { session, players } = this._store.state;
    const playerCount = players.players.length;
    const indexAdjusted =
      (index - 1 + playerCount - session.nomination[1]) % playerCount;
    if (fromST || indexAdjusted >= session.lockedVote - 1) {
      this._store.commit("session/vote", [index, vote]);
    }
  }

  lockVote() {
    if (this._isSpectator) return;
    const { lockedVote, votes, nomination } = this._store.state.session;
    const { players } = this._store.state.players;
    const index = (nomination[1] + lockedVote - 1) % players.length;
    this._send("lock", [
      this._store.state.session.lockedVote,
      votes[index]
    ]);
  }

  _handleLock([lock, vote]) {
    if (!this._isSpectator) return;
    this._store.commit("session/lockVote", lock);
    if (lock > 1) {
      const { lockedVote, nomination } = this._store.state.session;
      const { players } = this._store.state.players;
      const index = (nomination[1] + lockedVote - 1) % players.length;
      if (this._store.state.session.votes[index] !== vote) {
        this._store.commit("session/vote", [index, vote]);
      }
    }
  }

  swapPlayer(payload) {
    if (this._isSpectator) return;
    this._send("swap", payload);
  }

  movePlayer(payload) {
    if (this._isSpectator) return;
    this._send("move", payload);
  }

  removePlayer(payload) {
    if (this._isSpectator) return;
    this._send("remove", payload);
  }
}

export default store => {
  let session;
  try {
    session = new LiveSession(store);
  } catch (err) {
    console.error("[socket] Failed to initialize live session:", err.message);
    return;
  }

  store.subscribe(({ type, payload }, state) => {
    switch (type) {
      case "session/setSessionId":
        if (state.session.sessionId) {
          session.connect(state.session.sessionId);
        } else {
          window.location.hash = "";
          session.disconnect();
        }
        break;
      case "session/claimSeat":
        session.claimSeat(payload);
        break;
      case "session/distributeRoles":
        if (payload) {
          session.distributeRoles();
        }
        break;
      case "session/setDistributeBluffsTarget":
        if (payload) {
          session.distributeBluffsToDemon(payload);
        }
        break;
      case "session/startGachaSession":
        session.broadcastGachaStart();
        break;
      case "session/drawGachaRole":
        session.requestGacha();
        break;
      case "session/nomination":
      case "session/setNomination":
        session.nomination(payload);
        break;
      case "session/setVoteInProgress":
        session.setVoteInProgress(payload);
        break;
      case "session/voteSync":
        session.vote(payload);
        break;
      case "session/lockVote":
        session.lockVote();
        break;
      case "session/setVotingSpeed":
        session.setVotingSpeed(payload);
        break;
      case "session/clearVoteHistory":
        session.clearVoteHistory();
        break;
      case "session/setVoteHistoryAllowed":
        session.setVoteHistoryAllowed();
        break;
      case "toggleNight":
        session.setIsNight();
        break;
      case "setEdition":
        session.sendEdition();
        break;
      case "players/setFabled":
        session.sendFabled();
        break;
      case "session/setMarkedPlayer":
        session.setMarked(payload);
        break;
      case "players/swap":
        session.swapPlayer(payload);
        break;
      case "players/move":
        session.movePlayer(payload);
        break;
      case "players/remove":
        session.removePlayer(payload);
        break;
      case "players/set":
      case "players/clear":
      case "players/add":
        session.sendGamestate("", true);
        break;
      case "players/update":
        if (payload.property === "pronouns") {
          session.sendPlayerPronouns(payload);
        } else {
          session.sendPlayer(payload);
        }
        break;
    }
  });

  // Auto-join as spectator if session ID is in URL hash
  const sessionId = window.location.hash.substr(1);
  if (sessionId) {
    store.commit("session/setSpectator", true);
    store.commit("session/setSessionId", sessionId);
    store.commit("toggleGrimoire", false);
  }
};
