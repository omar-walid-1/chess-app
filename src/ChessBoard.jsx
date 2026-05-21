import { useState, useEffect, useCallback } from "react";
import { Chess } from "chess.js";
import { playMove, playCapture, playCheck, playCheckmate, playCastle, playPromotion } from "./sounds";

const PIECES = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟"
};

const PROMOTION_PIECES = [
  { type: "q", label: "♛", name: "وزيرة" },
  { type: "r", label: "♜", name: "رخ" },
  { type: "b", label: "♝", name: "فيل" },
  { type: "n", label: "♞", name: "حصان" },
];

export default function ChessBoard({ fen, onMove, myColor, gameStatus }) {
  const [chess] = useState(() => new Chess());
  const [selected, setSelected] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [board, setBoard] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [inCheck, setInCheck] = useState(false);
  const [kingSquare, setKingSquare] = useState(null);
  // Promotion
  const [promotionPending, setPromotionPending] = useState(null); // { from, to }

  useEffect(() => {
    try {
      chess.load(fen);
      setBoard(chess.board());
      setSelected(null);
      setLegalMoves([]);

      const isCheck = chess.isCheck();
      setInCheck(isCheck);
      if (isCheck) {
        const turn = chess.turn();
        let ks = null;
        chess.board().forEach((row, r) => row.forEach((p, c) => {
          if (p && p.type === "k" && p.color === turn)
            ks = String.fromCharCode(97 + c) + (8 - r);
        }));
        setKingSquare(ks);
      } else {
        setKingSquare(null);
      }
    } catch {}
  }, [fen]);

  const myTurn = useCallback(() => {
    const turn = chess.turn();
    return (turn === "w" && myColor === "white") || (turn === "b" && myColor === "black");
  }, [chess, myColor]);

  function squareFromDisplay(row, col) {
    const r = myColor === "black" ? 7 - row : row;
    const c = myColor === "black" ? 7 - col : col;
    return String.fromCharCode(97 + c) + (8 - r);
  }

  function isPromotionMove(from, to) {
    const piece = chess.get(from);
    if (!piece || piece.type !== "p") return false;
    const toRank = to[1];
    return (piece.color === "w" && toRank === "8") || (piece.color === "b" && toRank === "1");
  }

  function executeMove(from, to, promotion = "q") {
    const result = chess.move({ from, to, promotion });
    if (!result) return;

    // Play sound
    if (chess.isCheckmate()) playCheckmate();
    else if (chess.isCheck()) playCheck();
    else if (result.flags.includes("p")) playPromotion();
    else if (result.flags.includes("k") || result.flags.includes("q")) playCastle();
    else if (result.captured) playCapture();
    else playMove();

    setLastMove({ from, to });
    onMove(chess.fen(), result);
    setSelected(null);
    setLegalMoves([]);
    setPromotionPending(null);
  }

  function handleSquareClick(row, col) {
    if (myColor === "spectator") return;
    if (gameStatus !== "playing") return;
    if (!myTurn()) return;
    if (promotionPending) return; // في انتظار اختيار الترقية

    const square = squareFromDisplay(row, col);
    const piece = chess.get(square);

    if (selected) {
      if (selected === square) { setSelected(null); setLegalMoves([]); return; }

      const move = legalMoves.find(m => m.to === square);
      if (move) {
        if (isPromotionMove(selected, square)) {
          // وقف وأظهر اختيار الترقية
          setPromotionPending({ from: selected, to: square });
          setSelected(null);
          setLegalMoves([]);
        } else {
          executeMove(selected, square);
        }
        return;
      }

      if (piece && piece.color === chess.turn()) {
        setSelected(square);
        setLegalMoves(chess.moves({ square, verbose: true }));
        return;
      }

      setSelected(null); setLegalMoves([]);
      return;
    }

    if (piece && piece.color === chess.turn()) {
      setSelected(square);
      setLegalMoves(chess.moves({ square, verbose: true }));
    }
  }

  const size = Math.min(window.innerWidth - 24, 440);
  const sq = Math.floor(size / 8);
  const turn = chess.turn();
  const isMyTurnNow = myTurn();

  return (
    <div style={{ userSelect: "none", direction: "ltr", position: "relative" }}>
      {/* Status bar */}
      <div style={{
        textAlign: "center", padding: "7px 12px", marginBottom: 8,
        borderRadius: 10, background: "#1a1d27",
        fontFamily: "'Cairo', sans-serif", fontSize: 13,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8
      }}>
        {gameStatus === "waiting" && <span style={{ color: "#888" }}>⏳ في انتظار اللاعب الثاني...</span>}
        {gameStatus === "playing" && !promotionPending && (
          inCheck
            ? <span style={{ color: "#ff6b6b", fontWeight: 700 }}>⚠️ كش! {isMyTurnNow ? "(دورك تتحرك)" : "(الخصم في كش)"}</span>
            : isMyTurnNow
              ? <span style={{ color: "#4CAF50", fontWeight: 700 }}>🟢 دورك!</span>
              : <span style={{ color: "#888" }}>⏳ دور {turn === "w" ? "الأبيض" : "الأسود"}</span>
        )}
        {promotionPending && <span style={{ color: "#c9a84c", fontWeight: 700 }}>⭐ اختار الترقية</span>}
        {gameStatus === "checkmate" && <span style={{ color: "#e8d5a3" }}>🏁 انتهت اللعبة!</span>}
        {gameStatus === "draw" && <span style={{ color: "#e8d5a3" }}>🤝 تعادل!</span>}
        {myColor === "spectator" && <span style={{ color: "#555" }}> (👁 متفرج)</span>}
      </div>

      {/* Board */}
      <div style={{ position: "relative" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(8, ${sq}px)`,
          gridTemplateRows: `repeat(8, ${sq}px)`,
          border: "3px solid #c9a84c",
          borderRadius: 6, overflow: "hidden",
          boxShadow: "0 8px 40px #000a"
        }}>
          {Array.from({ length: 8 }, (_, row) =>
            Array.from({ length: 8 }, (_, col) => {
              const actualRow = myColor === "black" ? 7 - row : row;
              const actualCol = myColor === "black" ? 7 - col : col;
              const square = String.fromCharCode(97 + actualCol) + (8 - actualRow);
              const piece = board[actualRow]?.[actualCol];
              const isLight = (actualRow + actualCol) % 2 === 0;

              const isSelected = selected === square;
              const isLegalTarget = legalMoves.some(m => m.to === square);
              const isLastFrom = lastMove?.from === square;
              const isLastTo = lastMove?.to === square;
              const isKingInCheck = square === kingSquare && inCheck;
              const isMyPiece = piece && piece.color === (myColor === "white" ? "w" : "b");

              let bg = isLight ? "#f0d9b5" : "#b58863";
              if (isLastFrom || isLastTo) bg = isLight ? "#cdd16a" : "#aaa23a";
              if (isSelected) bg = "#f6f669";
              if (isKingInCheck) bg = "#e84040";

              let cursor = "default";
              if (myColor !== "spectator" && gameStatus === "playing" && !promotionPending) {
                cursor = isMyTurnNow
                  ? (isMyPiece || isLegalTarget ? "pointer" : "not-allowed")
                  : "not-allowed";
              }

              return (
                <div
                  key={`${row}-${col}`}
                  onClick={() => handleSquareClick(row, col)}
                  style={{
                    width: sq, height: sq, background: bg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor, position: "relative", transition: "background 0.08s"
                  }}
                >
                  {isLegalTarget && !piece && (
                    <div style={{
                      width: sq * 0.28, height: sq * 0.28,
                      borderRadius: "50%", background: "rgba(0,0,0,0.18)",
                      pointerEvents: "none"
                    }} />
                  )}
                  {isLegalTarget && piece && (
                    <div style={{
                      position: "absolute", inset: 0,
                      boxShadow: "inset 0 0 0 4px rgba(0,0,0,0.28)",
                      pointerEvents: "none", zIndex: 1
                    }} />
                  )}
                  {piece && (
                    <span style={{
                      fontSize: sq * 0.72, lineHeight: 1, userSelect: "none", zIndex: 2,
                      filter: piece.color === "w"
                        ? "drop-shadow(0 1px 3px rgba(0,0,0,0.6))"
                        : "drop-shadow(0 1px 3px rgba(0,0,0,0.9))",
                    }}>
                      {PIECES[piece.color + piece.type.toUpperCase()]}
                    </span>
                  )}
                  {col === 0 && (
                    <span style={{
                      position: "absolute", top: 2, right: 3, fontSize: 8,
                      color: isLight ? "#b58863" : "#f0d9b5", fontWeight: "bold",
                      pointerEvents: "none", zIndex: 3
                    }}>{8 - actualRow}</span>
                  )}
                  {row === 7 && (
                    <span style={{
                      position: "absolute", bottom: 1, left: 3, fontSize: 8,
                      color: isLight ? "#b58863" : "#f0d9b5", fontWeight: "bold",
                      pointerEvents: "none", zIndex: 3
                    }}>{String.fromCharCode(97 + actualCol)}</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Promotion picker overlay */}
        {promotionPending && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 6, zIndex: 20,
            backdropFilter: "blur(2px)"
          }}>
            <div style={{
              background: "#1a1d27", borderRadius: 16,
              padding: "20px 16px", textAlign: "center",
              border: "2px solid #c9a84c",
              boxShadow: "0 8px 40px #000c"
            }}>
              <div style={{
                color: "#e8d5a3", fontSize: 14, fontWeight: 700,
                fontFamily: "'Cairo', sans-serif", marginBottom: 14
              }}>⭐ اختار الترقية</div>
              <div style={{ display: "flex", gap: 10 }}>
                {PROMOTION_PIECES.map(p => {
                  const isWhite = myColor === "white";
                  const symbol = isWhite
                    ? PIECES["w" + p.type.toUpperCase()]
                    : PIECES["b" + p.type.toUpperCase()];
                  return (
                    <button
                      key={p.type}
                      onClick={() => executeMove(promotionPending.from, promotionPending.to, p.type)}
                      title={p.name}
                      style={{
                        width: 60, height: 60, borderRadius: 12,
                        background: "#0f1117", border: "2px solid #2d3044",
                        cursor: "pointer", fontSize: 36,
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center",
                        transition: "all 0.15s", gap: 2
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#c9a84c"; e.currentTarget.style.borderColor = "#c9a84c"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "#0f1117"; e.currentTarget.style.borderColor = "#2d3044"; }}
                    >
                      <span style={{ lineHeight: 1 }}>{symbol}</span>
                      <span style={{ fontSize: 9, color: "#888", fontFamily: "'Cairo', sans-serif" }}>{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
