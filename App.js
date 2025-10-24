// App.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Animated,
  Easing,
  Dimensions,
  ImageBackground,
  ActivityIndicator
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { G, Path, Circle } from "react-native-svg";
import RestaurantPickerModal from "./components/RestaurantPickerModal";
import { getSelectedRestaurant, setSelectedRestaurant } from "./store/selection";
import { fetchQuizSession } from "./services/quizApi"; // <-- LLM backend çağrısı


const Stack = createNativeStackNavigator();

/* ---------- Global wheel memory (re-spin yok) ---------- */
let WHEEL_RESULT = null;     // { index, label } | null
let WHEEL_SPUN = false;

/* ---------- Palette ---------- */
const PALETTE = {
  // Quiz sayfaları (yeşil)
  gradStart: "#0C211B",
  gradEnd:   "#0A2F25",
  // Çark sayfası (koyu kırmızı)
  wheelGradStart: "#2a0c0e",
  wheelGradEnd:   "#3a1216",

  text:      "#F1F6F4",
  subtext:   "rgba(241,246,244,0.85)",
  accent: "#2EC774",
  accentPressed: "#28B068",
  progressDefault: "#11293F",
  progressCurrent: "#FFC857",
  progressCorrect: "#4CC9F0",
  progressWrong:   "#E95656",
  timerRed: "#D7263D",
  primaryBlue: "#2EB5F0",
  primaryBluePressed: "#26A3E0",
  red: "#E10600",
  offwhite: "#FDFDFD",
};

/* =========================================================
   PAGE 1 — Splash (Logo + START + tagline)
========================================================= */
function Page1({ navigation }) {
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 1.06, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.9, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseScale, pulseOpacity]);

  const tagline = "Solve quick quizzes, nail the answers, win free treats!\nSpin the wheel and snag discount coupons!";
  const chars = useMemo(() => tagline.split(""), [tagline]);
  const charAnim = useRef(chars.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const wave = () =>
      Animated.stagger(
        25,
        charAnim.map((v, idx) =>
          Animated.sequence([
            Animated.timing(v, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(v, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.delay(idx % 15 === 0 ? 120 : 0),
          ])
        )
      );
    let ok = true;
    (async () => {
      while (ok) {
        await new Promise((r) => wave().start(() => r()));
        await new Promise((r) => setTimeout(r, 800));
      }
    })();
    return () => { ok = false; };
  }, [charAnim]);

  return (
    <LinearGradient colors={[PALETTE.gradStart, PALETTE.gradEnd]} style={{ flex: 1 }}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <SafeAreaView edges={["top","right","bottom","left"]} style={styles.fullscreenCenter}>
        <View style={styles.logoWrap}>
          <Image source={require("./assets/logo.png")} style={styles.logo} resizeMode="contain" />
        </View>

        <Animated.View style={[styles.startWrapper, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]}>
          <Pressable
            onPress={() => navigation.navigate("Page2")}
            style={({ pressed }) => [styles.startBtn, { backgroundColor: pressed ? PALETTE.accentPressed : PALETTE.accent }]}
          >
            <Text style={styles.startText}>START</Text>
          </Pressable>
        </Animated.View>

        <View style={styles.taglineWrap}>
          {chars.map((c, i) => {
            if (c === " ") return <Text key={`sp-${i}`}> </Text>;
            if (c === "\n") return <Text key={`nl-${i}`}>{"\n"}</Text>;
            const translateY = charAnim[i].interpolate({ inputRange: [0,1], outputRange: [0,-6] });
            const scale      = charAnim[i].interpolate({ inputRange: [0,1], outputRange: [1,1.06] });
            return (
              <Animated.Text key={`ch-${i}`} style={[styles.taglineChar, { transform: [{ translateY }, { scale }], color: PALETTE.subtext }]}>
                {c}
              </Animated.Text>
            );
          })}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

/* =========================================================
   PAGE 2 — Intro (staged) + START
========================================================= */
function Page2({ navigation }) {
  const messages = [
    "Answer 10 quiz questions quickly — you have 35 seconds for each.",
    "If you answer all 10, you’ll spin the prize wheel and win discount coupons.",
    "If you’re ready, let’s begin.",
  ];
  const [idx, setIdx] = useState(0);
  const [showStart, setShowStart] = useState(false);

  // 🔽 Restoran seçimi için local state + modal
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState(getSelectedRestaurant()); // store/selection.js

  // Mesaj animasyonları
  const msgOpacity = useRef(new Animated.Value(0)).current;
  const msgY       = useRef(new Animated.Value(8)).current;

  // START butonu puls animasyonu
  const pulseScale   = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(1)).current;

  // Intro mesajlarını sırayla göster
  useEffect(() => {
    const animateIn = () => Animated.parallel([
      Animated.timing(msgOpacity, { toValue: 1, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(msgY,       { toValue: 0, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]);
    const animateOut = () => Animated.parallel([
      Animated.timing(msgOpacity, { toValue: 0, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(msgY,       { toValue: -8, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);

    let ok = true;
    (async () => {
      for (let i = 0; i < messages.length && ok; i++) {
        setIdx(i);
        msgOpacity.setValue(0);
        msgY.setValue(8);
        await new Promise((r) => animateIn().start(() => r()));
        await new Promise((r) => setTimeout(r, 3600));
        if (i < messages.length - 1) {
          await new Promise((r) => animateOut().start(() => r()));
          await new Promise((r) => setTimeout(r, 120));
        }
      }
      if (ok) setShowStart(true);
    })();
    return () => { ok = false; };
  }, [msgOpacity, msgY]);

  // START butonu nabız efekti
  useEffect(() => {
    if (!showStart) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale,   { toValue: 1.06, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.9,  duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale,   { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [showStart, pulseScale, pulseOpacity]);

  return (
    <LinearGradient colors={[PALETTE.gradStart, PALETTE.gradEnd]} style={{ flex: 1 }}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <SafeAreaView edges={["top","right","bottom","left"]} style={[styles.fullscreenCenter, { paddingTop: 12 }]}>
        <Animated.Text
          style={[
            styles.messageText,
            { color: PALETTE.text, opacity: msgOpacity, transform: [{ translateY: msgY }], textAlign: "center" },
          ]}
        >
          {messages[idx]}
        </Animated.Text>

        {/* --- Select Restaurant alanı (START’ın ÜSTÜNDE) --- */}
        {showStart && (
          <View style={{ width: "100%", gap: 8 }}>
            <Text style={{ color: PALETTE.subtext, fontWeight: "800", textAlign: "center" }}>
              Select Restaurant
            </Text>
            <Pressable
              onPress={() => setPickerOpen(true)}
              style={({ pressed }) => [
                styles.bigCardBtn,
                {
                  backgroundColor: pressed
                    ? "rgba(255,255,255,0.10)"
                    : "rgba(255,255,255,0.08)",
                },
              ]}
            >
              <Text style={{ color: PALETTE.text, fontWeight: "900" }}>
                {selected ? selected.name : "Choose from list"}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Modal (AYRI DOSYADAN) */}
        <RestaurantPickerModal
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={(item) => {
            const sel = { id: item.id, name: item.name };
            setSelected(sel);
            setSelectedRestaurant(sel); // global store’a yaz
            setPickerOpen(false);
          }}
          palette={PALETTE}
        />

        {/* --- START (seçim yoksa disabled) --- */}
        {showStart && (
          <Animated.View style={{ transform: [{ scale: pulseScale }], opacity: pulseOpacity }}>
            <Pressable
              onPress={() => navigation.navigate("Page3", { restaurant: selected })}
              disabled={!selected}
              style={({ pressed }) => [
                styles.startBtn,
                {
                  backgroundColor: pressed ? PALETTE.accentPressed : PALETTE.accent,
                  opacity: selected ? 1 : 0.6, // görsel ipucu
                },
              ]}
            >
              <Text style={styles.startText}>{selected ? "START" : "SELECT A RESTAURANT"}</Text>
            </Pressable>
          </Animated.View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

/* =========================================================
   MOCK QUESTIONS (10)
========================================================= */
const QUESTIONS = [
  { q: "Which planet is known as the Red Planet?", options: ["Mercury", "Mars", "Jupiter", "Venus"], correctIndex: 1 },
  { q: "What is the capital of Japan?",            options: ["Seoul", "Tokyo", "Beijing", "Osaka"], correctIndex: 1 },
  { q: "Which gas do plants absorb from the atmosphere?", options: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Helium"], correctIndex: 2 },
  { q: "What is 9 × 7?",                           options: ["56", "72", "63", "81"], correctIndex: 2 },
  { q: "Which ocean is the largest by area?",      options: ["Indian", "Pacific", "Atlantic", "Arctic"], correctIndex: 1 },
  { q: "Who wrote '1984'?",                        options: ["George Orwell", "J.K. Rowling", "Ernest Hemingway", "F. Scott Fitzgerald"], correctIndex: 0 },
  { q: "H2O is the chemical formula for what?",    options: ["Oxygen", "Hydrogen", "Salt", "Water"], correctIndex: 3 },
  { q: "Which language is primarily spoken in Brazil?", options: ["Spanish", "Portuguese", "French", "English"], correctIndex: 1 },
  { q: "What's the smallest prime number?",        options: ["0", "1", "2", "3"], correctIndex: 2 },
  { q: "Which instrument has keys, pedals, and strings?", options: ["Guitar", "Piano", "Violin", "Flute"], correctIndex: 1 },
];

/* =========================================================
   Page3 — Quiz + Interstitial + Flash + Emoji burst
========================================================= */
function Page3({ navigation, route }) {
  const chosen = route?.params?.restaurant ?? getSelectedRestaurant();

  // ---- Sabitler
  const START_SECONDS = 35;
  const EMOJI_SLOWMO = 1.6;

  // ---- LLM veya fallback'ten gelecek soru listesi
  const [questions, setQuestions] = useState([]); // {id,q,options[],correctIndex,explanation?,difficulty?,...}
  const TOTAL = questions.length;

  // ---- UI durumları
  const [loading, setLoading] = useState(true);
  const [qIndex, setQIndex] = useState(0);
  const [mode, setMode] = useState("question"); // "question" | "success" | "fail"
  const [status, setStatus] = useState([]);     // her soru için "idle|current|correct|wrong"

  // ---- Timer
  const [seconds, setSeconds] = useState(START_SECONDS);
  const timerAnim = useRef(new Animated.Value(1)).current;

  // ---- Emoji/görsel efektler
  const { width, height } = Dimensions.get("window");
  const successEmojis = ["👏","🎉","✨","🏆","🎊"];
  const failEmojis    = ["❌","😞","💥","⚠️","🚫"];
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const flashColorValue = useRef(new Animated.Value(0)).current; // 0=success, 1=fail
  const [particles, setParticles] = useState([]);

  // ---- FALLBACK: offline/LLM hatası için örnek sorular
  const FALLBACK_QUESTIONS = useMemo(() => ([
    {
      id: "f1",
      q: "Which planet is known as the Red Planet?",
      options: ["Mercury", "Mars", "Jupiter", "Venus"],
      correctIndex: 1,
      explanation: "Mars appears reddish due to iron oxide.",
      difficulty: "easy",
    },
    {
      id: "f2",
      q: "What is the capital of Japan?",
      options: ["Seoul", "Tokyo", "Beijing", "Osaka"],
      correctIndex: 1,
      difficulty: "easy",
    },
    // ... en az 8 tane daha doldur
  ]), []);

  // ---- LLM den soru çek + map et + fallback
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // restoran adına göre topics (isteğe bağlı)
        const topics = chosen?.name ? inferTopicsFromRestaurant(chosen.name) : [];

        const raw = await fetchQuizSession({
          count: 10,
          lang: "en",
          topics,
        });
        // LLM çıktısını UI formatına map et
        const mapped = (raw || []).map((q) => ({
          id: String(q.id || Math.random().toString(36).slice(2)),
          q: String(q.stem || q.q || "").trim(),
          options: Array.isArray(q.options) ? q.options.slice(0,4) : [],
          correctIndex: typeof q.correct_index === "number" ? q.correct_index
                        : typeof q.correctIndex === "number" ? q.correctIndex
                        : 0,
          explanation: q.explanation ? String(q.explanation) : "",
          difficulty: q.difficulty || "medium",
        }))
        .filter(item =>
          item.q &&
          item.options.length === 4 &&
          item.correctIndex >= 0 &&
          item.correctIndex < 4
        );

        const finalQs = mapped.length ? orderByDifficulty(mapped) : orderByDifficulty(FALLBACK_QUESTIONS);
        setQuestions(finalQs);
        setStatus(Array(finalQs.length).fill("idle").map((s, i) => (i === 0 ? "current" : "idle")));
        setQIndex(0);
        setMode("question");
        resetTimer();
      } catch (e) {
        console.warn("LLM failed, using fallback:", e?.message || e);
        const finalQs = orderByDifficulty(FALLBACK_QUESTIONS);
        setQuestions(finalQs);
        setStatus(Array(finalQs.length).fill("idle").map((s, i) => (i === 0 ? "current" : "idle")));
        setQIndex(0);
        setMode("question");
        resetTimer();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Timer reset helper
  const resetTimer = () => {
    setSeconds(START_SECONDS);
    timerAnim.stopAnimation();
    timerAnim.setValue(1);
    Animated.timing(timerAnim, {
      toValue: 0,
      duration: START_SECONDS * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  };

  // ---- Soru moduna geçince geri sayım başlat
  useEffect(() => {
    if (mode !== "question") return;
    let ok = true;
    const id = setInterval(() => {
      if (!ok) return;
      setSeconds((s) => {
        if (s <= 1) clearInterval(id);
        return s - 1;
      });
    }, 1000);
    return () => { ok = false; clearInterval(id); };
  }, [qIndex, mode]);

  // ---- Süre biterse
  useEffect(() => {
    if (mode === "question" && seconds === 0) {
      setStatus((prev) => {
        const c = [...prev];
        c[qIndex] = "wrong";
        return c;
      });
      setMode("fail");
      burstEmojis("fail");
    }
  }, [seconds, mode, qIndex]);

  // ---- Emoji patlaması
  const burstEmojis = (type = "success", N = 48) => {
    const list = type === "success" ? successEmojis : failEmojis;
    const created = Array.from({ length: N }).map((_, i) => {
      const left = Math.random() * (width - 40);
      const delay = (Math.random() * 250) * EMOJI_SLOWMO;
      const scaleStart = 0.85 + Math.random() * 0.5;
      const travel = height * (0.65 + Math.random() * 0.3);
      const aY  = new Animated.Value(0);
      const aOp = new Animated.Value(0);
      const aSc = new Animated.Value(scaleStart);
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(aY,  { toValue: 1, duration: (900 + Math.random()*500) * EMOJI_SLOWMO, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(aOp, { toValue: 1, duration: 160 * EMOJI_SLOWMO, useNativeDriver: true }),
            Animated.timing(aOp, { toValue: 0, duration: 900 * EMOJI_SLOWMO, delay: 900 * EMOJI_SLOWMO, useNativeDriver: true }),
          ]),
          Animated.timing(aSc, { toValue: scaleStart * (1.05 + Math.random()*0.2), duration: 900 * EMOJI_SLOWMO, useNativeDriver: true }),
        ]),
      ]).start();
      return { id: `${Date.now()}-${i}`, emoji: list[i % list.length], left, aY, aOp, aSc, travel };
    });

    setParticles(created);
    flashColorValue.setValue(type === "success" ? 0 : 1);
    flashOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(flashOpacity, { toValue: 0.45, duration: 220 * EMOJI_SLOWMO, useNativeDriver: true }),
      Animated.timing(flashOpacity, { toValue: 0,    duration: 650 * EMOJI_SLOWMO, useNativeDriver: true }),
    ]).start(() => setParticles([]));
  };

  // ---- Yardımcılar
  const orderByDifficulty = (arr) => {
    // easy → medium → hard sıralı gelsin (aynı ise mevcut sırayı koru)
    const rank = { easy: 0, medium: 1, hard: 2 };
    return [...arr].sort((a, b) => (rank[a.difficulty] ?? 1) - (rank[b.difficulty] ?? 1));
  };
  const inferTopicsFromRestaurant = (name) => {
    const n = (name || "").toLowerCase();
    if (n.includes("kebab") || n.includes("doner")) return ["food", "turkish cuisine"];
    if (n.includes("zeytin") || n.includes("olive")) return ["mediterranean", "food"];
    return ["general"];
  };
  const colorForStep = (s) =>
    s === "current" ? PALETTE.progressCurrent :
    s === "correct" ? PALETTE.progressCorrect :
    s === "wrong"   ? PALETTE.progressWrong :
                      PALETTE.progressDefault;

  // ---- Cevap seçimi
  const onAnswer = (i) => {
    if (mode !== "question") return;
    const currentQ = questions[qIndex];
    const ok = i === currentQ.correctIndex;
    setStatus((prev) => {
      const c = [...prev];
      c[qIndex] = ok ? "correct" : "wrong";
      return c;
    });
    setMode(ok ? "success" : "fail");
    burstEmojis(ok ? "success" : "fail");
  };

  // ---- Sonraki soruya geç
  const goNext = () => {
    if (qIndex + 1 >= TOTAL) {
      navigation.navigate("Page4");
      return;
    }
    setQIndex((n) => n + 1);
    setMode("question");
    setStatus((prev) => {
      const c = [...prev];
      c[qIndex + 1] = "current";
      return c;
    });
    resetTimer();
  };

  // ---- Timer genişliği
  const timerWidth = timerAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  // ---- Render
  if (loading) {
    return (
      <LinearGradient colors={[PALETTE.gradStart, PALETTE.gradEnd]} style={{ flex: 1 }}>
        <StatusBar style="light" translucent backgroundColor="transparent" />
        <SafeAreaView edges={["top","right","bottom","left"]}
          style={{ flex:1, alignItems:"center", justifyContent:"center", gap:12 }}>
          <ActivityIndicator size="large" />
          <Text style={{ color: PALETTE.subtext, fontWeight:"800" }}>
            Generating questions…
          </Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // güvenlik: hiç soru yoksa fallback
  if (!TOTAL) {
    return (
      <LinearGradient colors={[PALETTE.gradStart, PALETTE.gradEnd]} style={{ flex: 1 }}>
        <StatusBar style="light" translucent backgroundColor="transparent" />
        <SafeAreaView edges={["top","right","bottom","left"]}
          style={{ flex:1, alignItems:"center", justifyContent:"center", gap:12 }}>
          <Text style={{ color: PALETTE.text, fontWeight:"900", fontSize:18 }}>
            No questions available.
          </Text>
          <Pressable onPress={() => navigation.goBack()}
            style={({pressed})=>[{ padding:12, borderRadius:12, borderWidth:1, borderColor:"rgba(255,255,255,0.18)",
              backgroundColor: pressed ? "rgba(255,255,255,0.06)" : "transparent"}]}>
            <Text style={{ color: PALETTE.text, fontWeight:"800" }}>Back</Text>
          </Pressable>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const currentQ = questions[qIndex];

  return (
    <LinearGradient colors={[PALETTE.gradStart, PALETTE.gradEnd]} style={{ flex: 1 }}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <SafeAreaView edges={["top","right","bottom","left"]} style={styles.quizContainer}>
        {/* progress bar */}
        <View style={styles.progressRow}>
          {status.map((s, i) => (
            <View key={i} style={[styles.progressSeg, { backgroundColor: colorForStep(s) }]} />
          ))}
        </View>

        {mode === "question" && (
          <>
            <View style={styles.questionWrap}>
              <Text style={[styles.questionText, { color: PALETTE.text }]}>{currentQ.q}</Text>
            </View>

            <View style={styles.optionsWrap}>
              {currentQ.options.map((opt, i) => (
                <Pressable
                  key={i}
                  onPress={() => onAnswer(i)}
                  style={({ pressed }) => [styles.optionBtn, { backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)" }]}
                >
                  <Text style={[styles.optionLabel, { color: PALETTE.text }]}>{String.fromCharCode(65 + i)}.</Text>
                  <Text style={[styles.optionText,  { color: PALETTE.text }]}>{opt}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.timerRow}>
              <View style={styles.timerTrack}>
                <Animated.View style={[styles.timerFill, { width: timerWidth, backgroundColor: PALETTE.timerRed }]} />
              </View>
              <Text style={[styles.timerText, { color: PALETTE.text }]}>{seconds}s</Text>
            </View>
          </>
        )}

        {mode === "success" && (
          <View style={styles.interludeWrap}>
            <Text style={[styles.interludeTitle, { color: PALETTE.text }]}>🎉 Congrats, correct!</Text>
            <Text style={[styles.interludeSub,   { color: PALETTE.subtext }]}>Next question</Text>
            <Pressable onPress={goNext} style={({ pressed }) => [styles.nextBtn, { backgroundColor: pressed ? PALETTE.primaryBluePressed : PALETTE.primaryBlue }]}>
              <Text style={styles.nextText}>NEXT</Text>
            </Pressable>
          </View>
        )}

        {mode === "fail" && (
          <View style={styles.interludeWrap}>
            <Text style={[styles.interludeTitle, { color: PALETTE.text }]}>❌ Sorry, wrong.</Text>
            <Text style={[styles.interludeSub,   { color: PALETTE.subtext }]}>See you next time!</Text>
            <Pressable
              onPress={() => navigation.reset({ index: 0, routes: [{ name: "Page1" }] })}
              style={({ pressed }) => [styles.nextBtn, { backgroundColor: pressed ? "#e04b4b" : "#f05c5c" }]}
            >
              <Text style={styles.nextText}>BACK TO START</Text>
            </Pressable>
          </View>
        )}

        {/* overlays: flash + particles */}
        <Animated.View
          pointerEvents="none"
          style={[styles.flashFull, {
            opacity: flashOpacity,
            backgroundColor: flashColorValue.interpolate({
              inputRange: [0, 1],
              outputRange: ["rgba(46,199,116,0.35)", "rgba(233,86,86,0.35)"],
            }),
          }]}
        />
        <View pointerEvents="none" style={styles.particlesLayer}>
          {particles.map((p) => (
            <Animated.Text
              key={p.id}
              style={{
                position: "absolute",
                left: p.left,
                bottom: 16,
                transform: [
                  { translateY: p.aY.interpolate({ inputRange: [0,1], outputRange: [0, -p.travel] }) },
                  { scale: p.aSc },
                ],
                opacity: p.aOp,
                fontSize: 26,
              }}
            >
              {p.emoji}
            </Animated.Text>
          ))}
        </View>

        {chosen && (
          <Text style={{ color: PALETTE.subtext, fontWeight: "800", textAlign: "center", marginTop: 6 }}>
            For: {chosen.name}
          </Text>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

/* =========================================================
   Page4 — Rewards summary (Wheel button = custom image)
========================================================= */
function Page4({ navigation }) {
  return (
    <LinearGradient colors={[PALETTE.gradStart, PALETTE.gradEnd]} style={{ flex: 1 }}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <SafeAreaView edges={["top","right","bottom","left"]} style={[styles.fullscreenCenter, { gap: 24 }]}>
        <Text style={[styles.pageTitle, { color: PALETTE.text, textAlign: "center" }]}>
          🎉 Congratulations — you earned both rewards!
        </Text>

        {/* Görsel buton: ./assets/go_wheel_button.png varsa onu kullan */}
        <WheelButton onPress={() => navigation.navigate("Page5")} />

        <View style={styles.couponCard}>
          <CouponImage />
          <View style={{ padding: 12 }}>
            <Text style={{ color: PALETTE.text, fontWeight: "900", fontSize: 18, marginBottom: 6 }}>
              CAT — 25% OFF Coupon
            </Text>
            <Text style={{ color: PALETTE.subtext, fontWeight: "700" }}>
              Your discount is ready. Spin the wheel above to get your extra prize too!
            </Text>
          </View>
        </View>

        <View style={styles.row}>
          <Pressable
            onPress={() => navigation.reset({ index: 0, routes: [{ name: "Page1" }] })}
            style={({ pressed }) => [styles.ghostBtn, pressed && styles.ghostPressed]}
          >
            <Text style={[styles.ghostText, { color: PALETTE.text }]}>Back to Start</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

function WheelButton({ onPress }) {
  let img = null;
  try { img = require("./assets/go_wheel_button.png"); } catch { img = null; }

  if (img) {
    return (
      <Pressable onPress={onPress} style={{ width: "100%", borderRadius: 18, overflow: "hidden" }}>
        <ImageBackground source={img} style={{ width: "100%", height: 120, justifyContent: "center", alignItems: "center" }} resizeMode="cover">
          {/* Görselin üstüne hafif gölge yazı istersen buraya eklenebilir */}
        </ImageBackground>
      </Pressable>
    );
  }
  // Fallback: düz buton
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.bigCardBtn, { backgroundColor: pressed ? PALETTE.primaryBluePressed : PALETTE.primaryBlue }]}
    >
      <Text style={styles.bigCardBtnText}>Go to Prize Wheel</Text>
    </Pressable>
  );
}

function CouponImage() {
  let img = null;
  try { img = require("./assets/cat_coupon.png"); } catch { img = null; }
  if (!img) return <View style={{ height: 160, backgroundColor: "rgba(255,255,255,0.08)", borderTopLeftRadius: 16, borderTopRightRadius: 16 }} />;
  return <Image source={img} style={{ width: "100%", height: 160, borderTopLeftRadius: 16, borderTopRightRadius: 16 }} resizeMode="cover" />;
}

/* =========================================================
   Page5 — SVG Prize Wheel (koyu kırmızı tema + rainbow result text)
========================================================= */
function Page5({ navigation }) {
  const { width } = Dimensions.get("window");
  const SIZE = Math.min(width - 40, 340);   // wheel diameter
  const R = SIZE / 2;
  const CX = R, CY = R;

  const SEGMENTS = [
    "Free Wine",
    "Baklava",
    "20% Off",
    "Sütlaç",
    "Free Beer",
    "Chat with HK (5m)",
  ];
  const N = SEGMENTS.length;
  const anglePer = 360 / N;

  const rotation = useRef(new Animated.Value(0)).current; // degrees
  const ledsOpacity = useRef(new Animated.Value(1)).current;
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(WHEEL_RESULT); // {index,label}

  /* LED blink */
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ledsOpacity, { toValue: 0.4, duration: 600, useNativeDriver: true }),
        Animated.timing(ledsOpacity, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [ledsOpacity]);

  const normalize = (deg) => ((deg % 360) + 360) % 360;

  const spin = () => {
    if (spinning || WHEEL_SPUN) return;
    setSpinning(true);
    const picked = Math.floor(Math.random() * N); // aday index

    const baseRot = 360 * 5; // 5 tur
    const targetAngle = baseRot + (picked + 0.5) * anglePer; // dilim merkezi pointer altına
    Animated.timing(rotation, {
      toValue: targetAngle,
      duration: 4600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      // 🔒 Nihai sonucu GERÇEK AÇIDAN hesapla → pointer ile %100 aynı
      const norm = normalize(targetAngle);
      const landedIndex = Math.floor(norm / anglePer) % N; // 0..N-1
      const res = { index: landedIndex, label: SEGMENTS[landedIndex] };
      setResult(res);
      WHEEL_RESULT = res;
      WHEEL_SPUN = true;
      setSpinning(false);
    });
  };

  /* Geometry helpers */
  const dArc = (startDeg, endDeg) => {
    const start = polarToCartesian(CX, CY, R - 6, endDeg);
    const end   = polarToCartesian(CX, CY, R - 6, startDeg);
    const large = endDeg - startDeg <= 180 ? 0 : 1;
    return `M ${start.x} ${start.y} A ${R - 6} ${R - 6} 0 ${large} 0 ${end.x} ${end.y} L ${CX} ${CY} Z`;
  };
  const polarToCartesian = (cx, cy, r, deg) => {
    const rad = (deg - 90) * (Math.PI / 180);
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const wheelRotate = rotation.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"] });
  const SIZE_WITH_LEDS = SIZE + 28;

  return (
    <LinearGradient colors={[PALETTE.wheelGradStart, PALETTE.wheelGradEnd]} style={{ flex: 1 }}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <SafeAreaView edges={["top","right","bottom","left"]} style={[styles.fullscreenCenter, { paddingHorizontal: 16, gap: 16 }]}>
        <Text style={[styles.pageTitle, { color: PALETTE.text, textAlign: "center" }]}>🎁 Prize Wheel</Text>

        {/* WHEEL AREA (SVG) */}
        <View style={{ alignItems: "center", justifyContent: "center" }}>
          {/* Pointer */}
          <View style={styles.pointer} />

          {/* LED ring (blink) */}
          <Animated.View style={{ position: "absolute", opacity: ledsOpacity }}>
            <Svg width={SIZE_WITH_LEDS} height={SIZE_WITH_LEDS}>
              <G x={14} y={14}>
                {Array.from({ length: 28 }).map((_, i) => {
                  const deg = (i / 28) * 360;
                  const p = polarToCartesian(CX, CY, R + 8, deg);
                  return <Circle key={i} cx={p.x} cy={p.y} r={3} fill="#fff" />;
                })}
              </G>
            </Svg>
          </Animated.View>

          {/* Wheel (rotating) */}
          <Animated.View style={{ transform: [{ rotate: wheelRotate }] }}>
            <Svg width={SIZE} height={SIZE}>
              <G>
                {SEGMENTS.map((_, i) => {
                  const start = i * anglePer;
                  const end   = (i + 1) * anglePer;
                  const isRed = i % 2 === 0;
                  return <Path key={i} d={dArc(start, end)} fill={isRed ? PALETTE.red : PALETTE.offwhite} stroke="#222" strokeWidth={1} />;
                })}
                <Circle cx={CX} cy={CY} r={26} fill="#111" />
              </G>
            </Svg>

            {/* Etiketler (yatay, segment merkezlerinde) */}
            <View style={{ position: "absolute", left: 0, top: 0, width: SIZE, height: SIZE }}>
              {SEGMENTS.map((lab, i) => {
                const mid = (i + 0.5) * anglePer;
                const p = polarToCartesian(CX, CY, R - 62, mid);
                return (
                  <View key={i} style={{ position: "absolute", left: p.x - 60, top: p.y - 12, width: 120, alignItems: "center" }}>
                    <Text
                      style={{
                        color: "#111",
                        fontWeight: "900",
                        fontSize: 13,
                        textAlign: "center",
                        backgroundColor: "rgba(255,255,255,0.7)",
                        paddingHorizontal: 6,
                        borderRadius: 8,
                      }}
                      numberOfLines={2}
                    >
                      {lab}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Animated.View>
        </View>

        {/* Controls */}
        {!WHEEL_SPUN ? (
          <Pressable
            onPress={spin}
            disabled={spinning}
            style={({ pressed }) => [
              styles.bigCardBtn,
              { backgroundColor: pressed ? PALETTE.primaryBluePressed : PALETTE.primaryBlue, opacity: spinning ? 0.6 : 1 },
            ]}
          >
            <Text style={styles.bigCardBtnText}>{spinning ? "Spinning..." : "SPIN"}</Text>
          </Pressable>
        ) : (
          <View style={[styles.resultCard, { borderColor: "rgba(255,255,255,0.18)", alignItems: "center" }]}>
            <Text style={{ color: PALETTE.text, fontSize: 16, fontWeight: "900", marginBottom: 8 }}>Your prize</Text>
            <RainbowText text={result?.label ?? WHEEL_RESULT?.label ?? "—"} />
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 8 }}>(Already decided. Re-spin disabled)</Text>
          </View>
        )}

        <View style={styles.row}>
          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.ghostBtn, pressed && styles.ghostPressed]}>
            <Text style={[styles.ghostText, { color: PALETTE.text }]}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

/* ---------- Rainbow animated text (per-letter color + bounce) ---------- */
function RainbowText({ text = "" }) {
  const letters = text.split("");
  // 6 renk – pürüzsüz döngü
  const spectrum = ["#ff4d4d", "#ffcc00", "#33ff99", "#3399ff", "#cc66ff", "#ff4d4d"];
  // Her harfe ayrı animasyon (farklı faz)
  const anims = useRef(letters.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const loops = anims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(a, { toValue: 1, duration: 1400 + (i % 3) * 200, easing: Easing.linear, useNativeDriver: false }),
          Animated.timing(a, { toValue: 0, duration: 1400 + (i % 3) * 200, easing: Easing.linear, useNativeDriver: false }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop && l.stop());
  }, [anims]);

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }}>
      {letters.map((ch, i) => {
        if (ch === " ") return <Text key={`sp-${i}`}> </Text>;
        const color = anims[i].interpolate({ inputRange: [0, 1], outputRange: [spectrum[i % spectrum.length], spectrum[(i + 1) % spectrum.length]] });
        const translateY = anims[i].interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
        const scale = anims[i].interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
        return (
          <Animated.Text
            key={`ch-${i}`}
            style={{
              color,
              transform: [{ translateY }, { scale }],
              fontSize: 22,
              fontWeight: "900",
              letterSpacing: 0.4,
            }}
          >
            {ch}
          </Animated.Text>
        );
      })}
    </View>
  );
}

/* =========================================================
   ROOT
========================================================= */
export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Page1" screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
        <Stack.Screen name="Page1" component={Page1} />
        <Stack.Screen name="Page2" component={Page2} />
        <Stack.Screen name="Page3" component={Page3} />
        <Stack.Screen name="Page4" component={Page4} />
        <Stack.Screen name="Page5" component={Page5} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

/* =========================================================
   STYLES
========================================================= */
const styles = StyleSheet.create({
  fullscreenCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    gap: 18,
  },
  logoWrap: {
    width: 140,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 140,
  },
  logo: { width: 200, height: 200 },

  startWrapper: {
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    borderRadius: 16,
  },
  startBtn: {
    paddingVertical: 25,
    paddingHorizontal: 56,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  startText: { color: "#0E1A14", fontSize: 18, fontWeight: "900", letterSpacing: 1 },

  taglineWrap: {
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
    maxWidth: 360,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  taglineChar: { fontSize: 13.5, lineHeight: 19, fontWeight: "600" },

  messageText: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: 0.2,
    paddingHorizontal: 16,
    maxWidth: 400,
    textAlign: "center",
  },

  pageTitle: { fontSize: 30, fontWeight: "800" },
  row: { flexDirection: "row", gap: 12, marginTop: 10 },

  ghostBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "transparent",
  },
  ghostPressed: { backgroundColor: "rgba(255,255,255,0.06)" },
  ghostText: { fontSize: 20, fontWeight: "700" },

  bigCardBtn: {
    width: "100%",
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  bigCardBtnText: { color: "#0B1720", fontSize: 16, fontWeight: "900", letterSpacing: 1 },

  couponCard: {
    width: "100%",
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },

  /** Quiz */
  quizContainer: {
    flex: 1,
    gap: 20,
    paddingHorizontal: 18,
    paddingTop: 10,
    justifyContent: "flex-start",
  },
  progressRow: { flexDirection: "row", gap: 6, paddingTop: 8, paddingBottom: 6 },
  progressSeg: { flex: 1, height: 10, borderRadius: 6 },
  questionWrap: { marginTop: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  questionText: { fontSize: 22, lineHeight: 30, fontWeight: "800", textAlign: "center" },
  optionsWrap: { marginTop: 10, gap: 10 },
  optionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  optionLabel: { fontSize: 16, fontWeight: "900", opacity: 0.95 },
  optionText: { fontSize: 16, fontWeight: "700", flexShrink: 1 },

  timerRow: { marginTop: "auto", marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  timerTrack: { flex: 1, height: 12, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  timerFill: { height: "100%", borderRadius: 8 },
  timerText: { fontSize: 16, fontWeight: "900" },

  /** Interlude */
  interludeWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 20 },
  interludeTitle: { fontSize: 28, fontWeight: "900", textAlign: "center" },
  interludeSub:   { fontSize: 16, fontWeight: "700", opacity: 0.9, textAlign: "center" },
  nextBtn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 16,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  nextText: { color: "#0B1720", fontSize: 16, fontWeight: "900", letterSpacing: 1 },

  /** Overlays */
  flashFull: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  particlesLayer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" },

  /** Wheel */
  pointer: {
    position: "absolute",
    top: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 22,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#fff",
    zIndex: 3,
  },
  resultCard: {
    width: "100%",
    padding: 16,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: StyleSheet.hairlineWidth,
  },
});
