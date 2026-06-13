<template>
  <transition name="gacha-fade">
    <div class="gacha-backdrop" v-if="show" @click.self="onBackdropClick">
      <div class="gacha-box">

        <!-- IDLE / DRAWING: tampilkan pouch -->
        <template v-if="phase !== 'revealed'">
          <div class="gacha-header">
            <span class="stars">✦ ✦ ✦</span>
            <h2>Your Fate Awaits</h2>
            <span class="stars">✦ ✦ ✦</span>
          </div>

          <div
            class="pouch-wrapper"
            :class="{ shaking: phase === 'drawing' }"
            @click="draw"
          >
            <div class="pouch-glow"></div>
            <div class="pouch">
              <div class="pouch-tie">
                <div class="loop left"></div>
                <div class="knot"></div>
                <div class="loop right"></div>
              </div>
              <div class="pouch-neck"></div>
              <div class="pouch-body">
                <div class="shine"></div>
              </div>
            </div>
          </div>

          <p class="pouch-hint" v-if="phase === 'idle'">
            Click the pouch to reveal your fate!
          </p>
          <p class="pouch-hint drawing" v-else>
            Drawing your destiny...
          </p>
        </template>

        <!-- REVEALED: tampilkan role -->
        <transition name="role-pop" appear v-if="phase === 'revealed'">
          <div class="role-reveal">
            <div class="reveal-header">
              <span class="stars shine">✨ ✨ ✨</span>
              <h2>You are the...</h2>
              <span class="stars shine">✨ ✨ ✨</span>
            </div>

            <div class="role-card" :class="[player.role.team]">
              <div class="role-icon-wrap">
                <div
                  class="role-icon"
                  :style="roleIconStyle"
                ></div>
              </div>
              <div class="role-details">
                <h3 class="role-name">{{ player.role.name }}</h3>
                <p class="role-ability" v-if="player.role.ability">
                  {{ player.role.ability }}
                </p>
              </div>
            </div>

            <button class="close-btn" @click="$emit('close')">Close</button>
          </div>
        </transition>

      </div>
    </div>
  </transition>
</template>

<script>
import { mapState } from "vuex";

export default {
  name: "GachaModal",
  props: {
    show: { type: Boolean, default: false },
    player: { type: Object, required: true }
  },
  data() {
    return { phase: "idle" };
  },
  computed: {
    ...mapState(["grimoire"]),
    roleIconStyle() {
      const role = this.player.role;
      if (!role || !role.id) return {};
      let url = "";
      if (role.image && this.grimoire.isImageOptIn) {
        url = role.image;
      } else {
        try {
          url = require(`../../assets/icons/${role.imageAlt || role.id}.png`);
        } catch (e) {
          url = "";
        }
      }
      return url ? { backgroundImage: `url(${url})` } : {};
    }
  },
  watch: {
    show(val) {
      if (val) this.phase = "idle";
    },
    player: {
      deep: true,
      handler(p) {
        if (p && p.role && p.role.id && this.phase === "drawing") {
          setTimeout(() => { this.phase = "revealed"; }, 400);
        }
      }
    }
  },
  methods: {
    draw() {
      if (this.phase !== "idle") return;
      this.phase = "drawing";
      this.$store.commit("session/drawGachaRole");
    },
    onBackdropClick() {
      if (this.phase !== "drawing") this.$emit("close");
    }
  }
};
</script>

<style lang="scss" scoped>
@import "../../vars.scss";

/* Backdrop */
.gacha-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

/* Modal box */
.gacha-box {
  background: radial-gradient(ellipse at 50% 20%, #1a0533 0%, #0a0018 100%);
  border: 2px solid rgba(180, 100, 255, 0.5);
  border-radius: 20px;
  padding: 36px 40px;
  width: 380px;
  max-width: 92vw;
  text-align: center;
  box-shadow: 0 0 40px rgba(140, 60, 220, 0.4), 0 0 80px rgba(80, 0, 160, 0.2);
  position: relative;
  overflow: hidden;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 50% 0%, rgba(120, 60, 200, 0.12), transparent 60%);
    pointer-events: none;
  }
}

/* Header */
.gacha-header, .reveal-header {
  margin-bottom: 24px;

  h2 {
    font-family: "PiratesBay", serif;
    font-size: 1.5rem;
    color: #f0d060;
    text-shadow: 0 0 12px rgba(240, 180, 50, 0.8);
    margin: 4px 0;
    letter-spacing: 2px;
  }

  .stars {
    font-size: 0.85rem;
    color: rgba(200, 160, 255, 0.7);
    letter-spacing: 4px;

    &.shine {
      color: gold;
      text-shadow: 0 0 6px gold;
    }
  }
}

/* Pouch wrapper */
.pouch-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  cursor: pointer;

  &:hover .pouch {
    transform: scale(1.05);
  }

  &.shaking .pouch {
    animation: shake 0.7s ease-in-out infinite;
    cursor: default;
  }
}

/* Glow behind pouch */
.pouch-glow {
  position: absolute;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(220, 160, 40, 0.25) 0%, transparent 70%);
  animation: pulse-glow 2.2s ease-in-out infinite;
  pointer-events: none;
}

/* Pouch shape */
.pouch {
  position: relative;
  width: 120px;
  height: 160px;
  transition: transform 200ms ease;
  filter: drop-shadow(0 6px 18px rgba(180, 120, 20, 0.5));
}

.pouch-body {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 110px;
  height: 105px;
  border-radius: 50% 50% 46% 46% / 28% 28% 72% 72%;
  background: radial-gradient(ellipse at 35% 28%, #e8c060, #c07818, #7a4a08);
  box-shadow:
    inset 0 3px 10px rgba(255, 230, 120, 0.35),
    inset 0 -4px 8px rgba(80, 40, 0, 0.4);

  .shine {
    position: absolute;
    top: 14%;
    left: 18%;
    width: 28%;
    height: 32%;
    border-radius: 50%;
    background: radial-gradient(ellipse, rgba(255, 245, 180, 0.55), transparent);
    pointer-events: none;
  }
}

.pouch-neck {
  position: absolute;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  width: 38px;
  height: 28px;
  background: linear-gradient(to bottom, #a06010, #c07818);
  border-radius: 30% 30% 0 0 / 60% 60% 0 0;
}

.pouch-tie {
  position: absolute;
  bottom: 122px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;

  .loop {
    width: 30px;
    height: 20px;
    border-radius: 50%;
    background: radial-gradient(ellipse at 40% 40%, #c88020, #7a4a08);
    border: 2px solid rgba(80, 40, 0, 0.6);

    &.left  { transform: rotate(-20deg) translateX(2px); }
    &.right { transform: rotate(20deg)  translateX(-2px); }
  }

  .knot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: radial-gradient(ellipse, #d09030, #8b5010);
    border: 2px solid rgba(80, 40, 0, 0.5);
    z-index: 1;
    margin: 0 -3px;
  }
}

/* Hint text */
.pouch-hint {
  margin-top: 16px;
  color: rgba(200, 170, 255, 0.85);
  font-size: 0.9rem;
  letter-spacing: 1px;

  &.drawing {
    color: gold;
    animation: flicker 1s ease-in-out infinite;
  }
}

/* Role reveal card */
.role-reveal {
  .reveal-header {
    margin-bottom: 20px;
  }
}

.role-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 16px;
  border: 2px solid rgba(255, 255, 255, 0.12);
  margin-bottom: 20px;
  text-align: left;

  &.townsfolk { border-color: rgba($townsfolk, 0.5); box-shadow: 0 0 12px rgba($townsfolk, 0.2); }
  &.outsider  { border-color: rgba($outsider, 0.5);  box-shadow: 0 0 12px rgba($outsider, 0.2); }
  &.minion    { border-color: rgba($minion, 0.5);    box-shadow: 0 0 12px rgba($minion, 0.2); }
  &.demon     { border-color: rgba($demon, 0.5);     box-shadow: 0 0 12px rgba($demon, 0.2); }
  &.traveler  { border-color: rgba($traveler, 0.5);  box-shadow: 0 0 12px rgba($traveler, 0.2); }
}

.role-icon-wrap {
  flex-shrink: 0;
  width: 90px;
  height: 90px;
  border-radius: 50%;
  background: url("../../assets/token.png") center/100%;
  border: 3px solid rgba(255, 255, 255, 0.2);
  overflow: hidden;
  position: relative;
}

.role-icon {
  position: absolute;
  inset: 0;
  background-size: 100%;
  background-repeat: no-repeat;
  background-position: center 30%;
  margin-top: 3%;
}

.role-details {
  flex: 1;

  .role-name {
    font-family: "PiratesBay", serif;
    font-size: 1.25rem;
    color: #f0d060;
    text-shadow: 0 0 8px rgba(240, 180, 50, 0.6);
    margin: 0 0 8px;
    letter-spacing: 1px;
  }

  .role-ability {
    font-size: 0.8rem;
    color: rgba(220, 210, 240, 0.85);
    line-height: 1.5;
    margin: 0;
    font-style: italic;
  }
}

/* Close button */
.close-btn {
  background: linear-gradient(135deg, #3d0066, #6a0dad);
  border: 2px solid rgba(180, 100, 255, 0.5);
  border-radius: 10px;
  color: white;
  padding: 10px 32px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 200ms, transform 100ms;
  font-family: inherit;
  letter-spacing: 1px;

  &:hover {
    background: linear-gradient(135deg, #5a0099, #8b00cc);
    transform: scale(1.03);
  }
  &:active {
    transform: scale(0.97);
  }
}

/* Transitions */
.gacha-fade-enter-active, .gacha-fade-leave-active {
  transition: opacity 250ms ease;
}
.gacha-fade-enter, .gacha-fade-leave-to {
  opacity: 0;
}

.role-pop-enter-active {
  animation: role-pop-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}
@keyframes role-pop-in {
  from { transform: scale(0.3) rotate(-8deg); opacity: 0; }
  to   { transform: scale(1) rotate(0deg);   opacity: 1; }
}

/* Keyframes */
@keyframes pulse-glow {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50%       { opacity: 1;   transform: scale(1.12); }
}

@keyframes shake {
  0%, 100% { transform: rotate(0deg)   translateY(0); }
  15%       { transform: rotate(-10deg) translateY(-4px); }
  30%       { transform: rotate(10deg)  translateY(-2px); }
  45%       { transform: rotate(-7deg)  translateY(-4px); }
  60%       { transform: rotate(7deg)   translateY(-2px); }
  75%       { transform: rotate(-4deg)  translateY(-3px); }
  90%       { transform: rotate(4deg)   translateY(-1px); }
}

@keyframes flicker {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
}
</style>
