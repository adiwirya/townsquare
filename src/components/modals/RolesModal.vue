<template>
  <Modal
    class="roles"
    v-if="modals.roles && nonTravelers >= 5"
    @close="toggleModal('roles')"
  >
    <h3>Select the characters for {{ nonTravelers }} players:</h3>
    <ul class="tokens" v-for="(teamRoles, team) in roleSelection" :key="team">
      <li class="count" :class="[team]">
        {{ teamRoles.reduce((a, { selected }) => a + selected, 0) }} /
        {{ game[nonTravelers - 5][team] }}
      </li>
      <li
        v-for="role in teamRoles"
        :class="[role.team, role.selected ? 'selected' : '']"
        :key="role.id"
        @click="role.selected = role.selected ? 0 : 1"
      >
        <Token :role="role" />
        <font-awesome-icon icon="exclamation-triangle" v-if="role.setup" />
        <div class="buttons" v-if="allowMultiple">
          <font-awesome-icon
            icon="minus-circle"
            @click.stop="role.selected--"
          />
          <span>{{ role.selected > 1 ? "x" + role.selected : "" }}</span>
          <font-awesome-icon icon="plus-circle" @click.stop="role.selected++" />
        </div>
      </li>
    </ul>
    <!-- Demon bluff selection -->
    <div class="bluff-section" v-if="hasDemonSelected">
      <div class="bluff-header">
        Demon Bluffs
        <span class="bluff-count" :class="{ full: bluffSelected.length === 3 }">{{ bluffSelected.length }}/3</span>
        <small> — roles not in play</small>
      </div>
      <div class="bluff-scroll">
        <template v-for="(roles) in bluffableRoles">
          <div
            v-for="role in roles"
            :key="'b-'+role.id"
            class="bluff-chip"
            :class="[role.team, { active: isBluffSelected(role.id), faded: bluffSelected.length >= 3 && !isBluffSelected(role.id) }]"
          >
            <Token :role="role" />
            <div class="bluff-cap" @click.stop="toggleBluff(role)"></div>
          </div>
        </template>
        <span v-if="!hasBluffableRoles" class="bluff-empty">No roles available</span>
      </div>
    </div>

    <div class="warning" v-if="hasSelectedSetupRoles">
      <font-awesome-icon icon="exclamation-triangle" />
      <span>
        Warning: there are characters selected that modify the game setup! The
        randomizer does not account for these characters.
      </span>
    </div>
    <label class="multiple" :class="{ checked: allowMultiple }">
      <font-awesome-icon :icon="allowMultiple ? 'check-square' : 'square'" />
      <input type="checkbox" name="allow-multiple" v-model="allowMultiple" />
      Allow duplicate characters
    </label>
    <div class="button-group">
      <div
        class="button"
        @click="assignRoles"
        :class="{
          disabled: selectedRoles > nonTravelers || !selectedRoles
        }"
      >
        <font-awesome-icon icon="people-arrows" />
        Assign {{ selectedRoles }} characters randomly
      </div>
      <div
        class="button gacha"
        @click="startGacha"
        :class="{
          disabled: selectedRoles > nonTravelers || !selectedRoles
        }"
      >
        <font-awesome-icon icon="dice" />
        Gacha mode — players draw their own
      </div>
      <div class="button" @click="selectRandomRoles">
        <font-awesome-icon icon="random" />
        Shuffle characters
      </div>
    </div>
  </Modal>
</template>

<script>
import Modal from "./Modal";
import gameJSON from "./../../game";
import Token from "./../Token";
import { mapGetters, mapMutations, mapState } from "vuex";

const randomElement = arr => arr[Math.floor(Math.random() * arr.length)];

export default {
  components: {
    Token,
    Modal
  },
  data: function() {
    return {
      roleSelection: {},
      game: gameJSON,
      allowMultiple: false,
      bluffSelected: []
    };
  },
  computed: {
    selectedRoles: function() {
      return Object.values(this.roleSelection)
        .map(roles => roles.reduce((a, { selected }) => a + selected, 0))
        .reduce((a, b) => a + b, 0);
    },
    hasSelectedSetupRoles: function() {
      return Object.values(this.roleSelection).some(roles =>
        roles.some(role => role.selected && role.setup)
      );
    },
    hasDemonSelected() {
      return !!(this.roleSelection.demon &&
        this.roleSelection.demon.some(r => r.selected > 0));
    },
    bluffableRoles() {
      const result = {};
      const bluffTeams = ["townsfolk", "outsider", "minion"];
      bluffTeams.forEach(team => {
        if (!this.roleSelection[team]) return;
        const unselected = this.roleSelection[team].filter(r => !r.selected);
        if (unselected.length) result[team] = unselected;
      });
      return result;
    },
    hasBluffableRoles() {
      return Object.values(this.bluffableRoles).some(r => r.length > 0);
    },
    ...mapState(["roles", "modals", "session"]),
    ...mapState("players", ["players"]),
    ...mapGetters({ nonTravelers: "players/nonTravelers" })
  },
  methods: {
    selectRandomRoles() {
      this.bluffSelected = [];
      this.roleSelection = {};
      this.roles.forEach(role => {
        if (!this.roleSelection[role.team]) {
          this.$set(this.roleSelection, role.team, []);
        }
        this.roleSelection[role.team].push(role);
        this.$set(role, "selected", 0);
      });
      delete this.roleSelection["traveler"];
      const playerCount = Math.max(5, this.nonTravelers);
      const composition = this.game[playerCount - 5];
      Object.keys(composition).forEach(team => {
        for (let x = 0; x < composition[team]; x++) {
          if (this.roleSelection[team]) {
            const available = this.roleSelection[team].filter(
              role => !role.selected
            );
            if (available.length) {
              randomElement(available).selected = 1;
            }
          }
        }
      });
    },
    assignRoles() {
      if (this.selectedRoles <= this.nonTravelers && this.selectedRoles) {
        // generate list of selected roles and randomize it
        const roles = Object.values(this.roleSelection)
          .map(roles =>
            roles
              .reduce((a, r) => [...a, ...Array(r.selected).fill(r)], [])
          )
          .reduce((a, b) => [...a, ...b], [])
          .map(a => [Math.random(), a])
          .sort((a, b) => a[0] - b[0])
          .map(a => a[1]);
        this.players.forEach(player => {
          if (player.role.team !== "traveler" && roles.length) {
            const value = roles.pop();
            this.$store.commit("players/update", { player, property: "role", value });
          }
        });
        // Set bluffs
        this.$store.commit("players/setBluff");
        this.bluffSelected.forEach((role, index) => {
          this.$store.commit("players/setBluff", { index, role });
        });
        // Auto-distribute in live session when bluffs are selected
        if (this.session.sessionId && this.bluffSelected.length) {
          this.$store.commit("session/distributeRoles", true);
          setTimeout(() => this.$store.commit("session/distributeRoles", false), 2000);
          const demonPlayer = this.players.find(p => p.role && p.role.team === "demon");
          if (demonPlayer && demonPlayer.id) {
            this.$store.commit("session/setDistributeBluffsTarget", demonPlayer.id);
            setTimeout(() => this.$store.commit("session/setDistributeBluffsTarget", null), 2000);
          }
        }
        this.$store.commit("toggleModal", "roles");
      }
    },
    isBluffSelected(roleId) {
      return this.bluffSelected.some(r => r.id === roleId);
    },
    toggleBluff(role) {
      const idx = this.bluffSelected.findIndex(r => r.id === role.id);
      if (idx >= 0) {
        this.bluffSelected.splice(idx, 1);
      } else if (this.bluffSelected.length < 3) {
        this.bluffSelected.push(role);
      }
    },
    startGacha() {
      if (this.selectedRoles > this.nonTravelers || !this.selectedRoles) return;
      // Build shuffled pool of role IDs from selected roles
      const pool = Object.values(this.roleSelection)
        .reduce((a, roles) => [
          ...a,
          ...roles.reduce((b, r) => [...b, ...Array(r.selected).fill(r.id)], [])
        ], [])
        .map(id => [Math.random(), id])
        .sort((a, b) => a[0] - b[0])
        .map(a => a[1]);
      // Clear all roles (treat as new game)
      this.players.forEach(player => {
        this.$store.commit("players/update", { player, property: "role", value: {} });
      });
      this.$store.commit("session/startGachaSession", pool);
      this.toggleModal("roles");
    },
    ...mapMutations(["toggleModal"])
  },
  mounted: function() {
    if (!Object.keys(this.roleSelection).length) {
      this.selectRandomRoles();
    }
  },
  watch: {
    roles() {
      this.selectRandomRoles();
    }
  }
};
</script>

<style lang="scss" scoped>
@import "../../vars.scss";

ul.tokens {
  padding-left: 5%;
  li {
    border-radius: 50%;
    width: 5vw;
    margin: 5px;
    opacity: 0.5;
    transition: all 250ms;
    &.selected {
      opacity: 1;
      .buttons {
        display: flex;
      }
      .fa-exclamation-triangle {
        display: block;
      }
    }
    &.townsfolk {
      box-shadow: 0 0 10px $townsfolk, 0 0 10px #004cff;
    }
    &.outsider {
      box-shadow: 0 0 10px $outsider, 0 0 10px $outsider;
    }
    &.minion {
      box-shadow: 0 0 10px $minion, 0 0 10px $minion;
    }
    &.demon {
      box-shadow: 0 0 10px $demon, 0 0 10px $demon;
    }
    &.traveler {
      box-shadow: 0 0 10px $traveler, 0 0 10px $traveler;
    }
    &:hover {
      transform: scale(1.2);
      z-index: 10;
    }
    .fa-exclamation-triangle {
      position: absolute;
      color: red;
      filter: drop-shadow(0 0 3px black) drop-shadow(0 0 3px black);
      bottom: -10px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 100%;
      display: none;
    }
    .buttons {
      display: none;
      position: absolute;
      top: 95%;
      text-align: center;
      width: 100%;
      z-index: 30;
      font-weight: bold;
      filter: drop-shadow(0 0 5px rgba(0, 0, 0, 1));
      span {
        flex-grow: 1;
      }
      svg {
        opacity: 0.25;
        cursor: pointer;
        &:hover {
          opacity: 1;
          color: red;
        }
      }
    }
  }
  .count {
    opacity: 1;
    position: absolute;
    left: 0;
    font-weight: bold;
    font-size: 75%;
    width: 5%;
    display: flex;
    align-items: center;
    justify-content: center;
    &:after {
      content: " ";
      display: block;
      padding-top: 100%;
    }
    &.townsfolk {
      color: $townsfolk;
    }
    &.outsider {
      color: $outsider;
    }
    &.minion {
      color: $minion;
    }
    &.demon {
      color: $demon;
    }
  }
}

.button.gacha {
  background: linear-gradient(135deg, #3d0066, #6a0dad);
  border-color: #9b30d9;
  &:hover:not(.disabled) {
    background: linear-gradient(135deg, #5a0099, #8b00cc);
  }
}

.bluff-section {
  margin: 6px 5% 4px;
  padding: 6px 8px;
  border: 1px solid rgba(200, 80, 80, 0.35);
  border-radius: 10px;
  background: rgba(100, 0, 0, 0.12);

  .bluff-header {
    font-size: 0.72rem;
    color: rgba(255, 150, 150, 0.9);
    text-align: center;
    margin-bottom: 6px;
    letter-spacing: 0.5px;
    small { color: rgba(255, 255, 255, 0.4); }
  }

  .bluff-count {
    font-weight: bold;
    margin: 0 3px;
    &.full { color: #ff4444; }
  }

  .bluff-scroll {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 5px;
    max-height: 110px;
    overflow-y: auto;
    padding: 2px;
  }

  .bluff-chip {
    width: 4vw;
    min-width: 40px;
    max-width: 52px;
    border-radius: 50%;
    opacity: 0.45;
    transition: opacity 200ms, transform 200ms, box-shadow 200ms;
    cursor: pointer;

    &:hover:not(.faded) {
      opacity: 0.85;
      transform: scale(1.1);
      z-index: 10;
    }
    &.active {
      opacity: 1;
      box-shadow: 0 0 10px 3px rgba(255, 80, 80, 0.65);
    }
    &.faded {
      opacity: 0.15;
    }
  }

  .bluff-cap {
    position: absolute;
    inset: 0;
    z-index: 5;
    border-radius: 50%;
    cursor: pointer;
  }

  .bluff-empty {
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.4);
    text-align: center;
    padding: 4px;
  }
}

.roles .modal {
  .multiple {
    display: block;
    text-align: center;
    cursor: pointer;
    &.checked,
    &:hover {
      color: red;
    }
    &.checked {
      margin-top: 10px;
    }
    svg {
      margin-right: 5px;
    }
    input {
      display: none;
    }
  }

  .warning {
    color: red;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 0.8rem;
    padding: 4px 10px;
    margin: 4px 5%;
    background: rgba(120, 0, 0, 0.15);
    border-radius: 8px;
    border: 1px solid rgba(200, 0, 0, 0.3);
    svg {
      font-size: 120%;
      flex-shrink: 0;
    }
    span {
      display: block;
      text-align: left;
    }
  }
}
</style>
