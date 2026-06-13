<template>
  <transition name="phase">
    <div class="phase-announcement" v-if="visible" :class="{ night: isNight }">
      <div class="phase-content">
        <div class="phase-name">{{ phaseName }}</div>
        <div class="phase-flavor">{{ flavorText }}</div>
      </div>
    </div>
  </transition>
</template>

<script>
import { mapState } from "vuex";

export default {
  name: "PhaseAnnouncement",
  data() {
    return {
      visible: false,
      isNight: false,
      timer: null
    };
  },
  computed: {
    ...mapState(["grimoire"]),
    phaseName() {
      if (!this.grimoire.roundCount) return "";
      return this.isNight
        ? `Night ${this.grimoire.roundCount}`
        : `Day ${this.grimoire.roundCount}`;
    },
    flavorText() {
      return this.isNight
        ? "The sun sets over Ravenswood Bluff..."
        : "The sun rises over Ravenswood Bluff...";
    }
  },
  watch: {
    "grimoire.isNight"(newVal) {
      if (!this.grimoire.roundCount) return;
      this.isNight = newVal;
      this.visible = true;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.visible = false;
      }, 3000);
    }
  }
};
</script>

<style lang="scss" scoped>
@import "../vars.scss";

.phase-announcement {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 200;
  background: radial-gradient(ellipse at center, rgba(255, 200, 80, 0.15) 0%, transparent 70%);

  &.night {
    background: radial-gradient(ellipse at center, rgba(40, 0, 80, 0.25) 0%, transparent 70%);
  }
}

.phase-content {
  text-align: center;
  animation: phase-breathe 3s ease-in-out forwards;
}

.phase-name {
  font-size: 4em;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: #fff;
  text-shadow: 0 0 30px rgba(255, 200, 80, 0.9), 0 2px 4px rgba(0, 0, 0, 0.8);

  .night & {
    text-shadow: 0 0 30px rgba(140, 80, 255, 0.9), 0 2px 4px rgba(0, 0, 0, 0.8);
  }
}

.phase-flavor {
  font-size: 1.3em;
  color: rgba(255, 255, 255, 0.7);
  margin-top: 8px;
  font-style: italic;
  letter-spacing: 0.05em;
}

@keyframes phase-breathe {
  0%   { opacity: 0; transform: scale(0.92); }
  20%  { opacity: 1; transform: scale(1); }
  70%  { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.04); }
}

.phase-enter-active,
.phase-leave-active {
  transition: opacity 400ms ease;
}
.phase-enter,
.phase-leave-to {
  opacity: 0;
}
</style>
