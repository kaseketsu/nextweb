import React, { useState, useRef, useEffect, use } from "react";
import _ from "lodash";
import { useNavigate } from "react-router-dom";
import { useAppConfig, useChatStore } from "../store";

import styles_chat from "../components/chat.module.scss";
import styles_tm from "../toastmasters/toastmasters.module.scss";
import { List, ListItem, showPrompt, showToast } from "../components/ui-lib";
import { IconButton } from "../components/button";
import { Markdown } from "../components/exporter";
import { useScrollToBottom } from "../components/chat";
import SendWhiteIcon from "../icons/send-white.svg";

import { ChatTitle, BorderLine } from "./chat-common";

import styles from "./ISpeech.module.scss";

import IconButtonMui from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Button from "@mui/joy/Button";
import ButtonGroup from "@mui/joy/ButtonGroup";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import MicIcon from "@mui/icons-material/Mic";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Tabs from "@mui/material/Tabs";
// import Tab from '@mui/material/Tab';
import PhoneIcon from "@mui/icons-material/Phone";
import FavoriteIcon from "@mui/icons-material/Favorite";
import PersonPinIcon from "@mui/icons-material/PersonPin";
import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import TabContext from "@mui/lab/TabContext";
import TabList from "@mui/lab/TabList";
import TabPanel from "@mui/lab/TabPanel";
import CircularProgress from "@mui/material/CircularProgress";

import {
  audioSpeechToText,
  speechRecognizer,
  speechSynthesizer,
} from "../cognitive/speech-sdk";

import {
  IQuestionItem,
  ImpromptuSpeechInput,
  ImpromptuSpeechPrompts,
  ImpromptuSpeechRoles,
  ImpromptuSpeechStage,
} from "./ISpeechRoles";
import ReactMarkdown from "react-markdown";
import { LinearProgressWithLabel } from "./ISpeech-Common";
import RehearsalReport from "./ISpeech-Report";
import {
  AudioRecorder,
  StageStatus,
} from "../cognitive/speech-audioRecorderClass";
import { useAudioRecorder } from "../cognitive/speech-audioRecorder";

// TODO:
const ToastmastersDefaultLangugage = "en";

export function Chat() {
  const chatStore = useChatStore();
  const [session, sessionIndex] = useChatStore((state) => [
    state.currentSession(),
    state.currentSessionIndex,
  ]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 设置自动滑动窗口
  const { scrollRef, setAutoScroll, scrollToBottom } = useScrollToBottom();

  // TODO: save selected job
  const config = useAppConfig();

  const getInputsString = (): string => {
    return "";
  };

  return (
    <div className={styles_chat.chat} key={session.id}>
      <ChatTitle getInputsString={getInputsString}></ChatTitle>
      <div
        className={styles_chat["chat-body"]}
        ref={scrollRef}
        onMouseDown={() => inputRef.current?.blur()}
        onTouchStart={() => {
          inputRef.current?.blur();
          setAutoScroll(false);
        }}
      >
        {session.inputCopilot.ActivePage === ImpromptuSpeechStage.Start && (
          <ImpromptuSpeechSetting></ImpromptuSpeechSetting>
        )}

        {session.inputCopilot.ActivePage === ImpromptuSpeechStage.Question && (
          <ImpromptuSpeechQuestion
            scrollRef={scrollRef}
            impromptuSpeechInput={session.inputCopilot}
          ></ImpromptuSpeechQuestion>
        )}

        {session.inputCopilot.ActivePage === ImpromptuSpeechStage.Report && (
          <RehearsalReport
            impromptuSpeechInput={session.inputCopilot}
          ></RehearsalReport>
        )}
      </div>
    </div>
  );
}

function ImpromptuSpeechSetting() {
  const chatStore = useChatStore();
  const [session, sessionIndex] = useChatStore((state) => [
    state.currentSession(),
    state.currentSessionIndex,
  ]);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  // TODO: save selected job
  const config = useAppConfig();
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);

  const onSubmit = async () => {
    if (
      session.inputCopilot.Topic === "" ||
      session.inputCopilot.QuestionNums <= 0
    ) {
      showToast(`Topic or questions is empty, please check`);
      return;
    }
    setSubmitting(true);
    setSubmitProgress(0);

    const progressStep = Math.floor(
      100 / (1 + session.inputCopilot.QuestionNums),
    );

    // reset status from 0
    chatStore.resetSession();

    let ask = ImpromptuSpeechPrompts.GetQuestionsPrompt(
      session.inputCopilot.Topic,
      session.inputCopilot.QuestionNums,
    );
    chatStore.onUserInput(ask);
    await chatStore.getIsFinished();
    setSubmitProgress(progressStep);

    let response = session.messages[session.messages.length - 1].content;
    console.log("Questions: ", response);

    let stringArray: string[] = [];
    try {
      stringArray = JSON.parse(response);
    } catch (error) {
      showToast(`Questions are not correct format, please try again.`);
      return;
    }

    session.inputCopilot.QuestionItems = [];
    for (let i = 0; i < stringArray.length; i++) {
      let question = stringArray[i];
      ask = ImpromptuSpeechPrompts.GetSampleSpeechPrompt(i, question);
      chatStore.onUserInput(ask);
      await chatStore.getIsFinished();

      response = session.messages[session.messages.length - 1].content;
      let questionItem = new IQuestionItem();
      questionItem.Question = question;
      questionItem.SampleSpeech = response;
      session.inputCopilot.QuestionItems.push(questionItem);

      setSubmitProgress(progressStep * (i + 2));
    }

    // reset so not effect sequential answer
    // but keep questions so that it has context
    chatStore.resetSessionFromIndex(2);

    chatStore.updateCurrentSession(
      (session) => (
        (session.inputCopilot.ActivePage = ImpromptuSpeechStage.Question),
        (session.inputCopilot.HasQuestions = true)
      ),
    );

    console.log("session.inputCopilot=", session.inputCopilot);
    setSubmitting(false);
  };

  const onContinue = async () => {
    chatStore.updateCurrentSession(
      (session) =>
        (session.inputCopilot.ActivePage = ImpromptuSpeechStage.Question),
    );
  };

  return (
    <List>
      <ListItem title="Topic">
        <textarea
          ref={inputRef}
          className={styles_chat["chat-input"]}
          onInput={(e) => {
            session.inputCopilot.Topic = e.currentTarget.value;
          }}
          defaultValue={session.inputCopilot.Topic}
          rows={1}
          style={{
            fontSize: config.fontSize,
            minHeight: "30px",
            marginLeft: "10px",
          }}
        />
      </ListItem>
      <ListItem title={"Questions"}>
        <input
          type="number"
          min={1}
          defaultValue={session.inputCopilot.QuestionNums}
          onChange={(e) => {
            session.inputCopilot.QuestionNums = parseInt(e.currentTarget.value);
          }}
        ></input>
      </ListItem>

      {submitting ? (
        <div>
          <Stack
            direction="row"
            spacing={10}
            justifyContent="center"
            alignItems="center"
            sx={{
              marginBottom: "20px",
              marginTop: "20px",
            }}
          >
            <IconButton
              icon={<SendWhiteIcon />}
              text="Submitting"
              disabled={true}
              className={styles_tm["chat-input-button-submitting"]}
              onClick={onSubmit}
            />
          </Stack>
          <LinearProgressWithLabel value={submitProgress} />
        </div>
      ) : (
        <Stack
          direction="row"
          spacing={10}
          justifyContent="center"
          alignItems="center"
          sx={{
            marginBottom: "20px",
            marginTop: "20px",
          }}
        >
          <IconButton
            icon={<SendWhiteIcon />}
            text="Submit"
            disabled={submitting}
            className={styles_tm["chat-input-button-submit"]}
            onClick={onSubmit}
          />
          {session.inputCopilot?.HasQuestions && (
            <button className={styles.capsuleButton} onClick={onContinue}>
              Continue Last
            </button>
          )}
        </Stack>
      )}
    </List>
  );
}

const ImpromptuSpeechQuestion = (props: {
  scrollRef: React.RefObject<HTMLDivElement>;
  impromptuSpeechInput: ImpromptuSpeechInput;
}) => {
  let { scrollRef, impromptuSpeechInput } = props;
  const questionItems = impromptuSpeechInput.QuestionItems;
  const questionNums = questionItems.length;

  const [evaluationRole, setEvaluationRole] = React.useState<string>(
    ImpromptuSpeechRoles.General,
  );

  const chatStore = useChatStore();
  const [session, sessionIndex] = useChatStore((state) => [
    state.currentSession(),
    state.currentSessionIndex,
  ]);
  const config = useAppConfig();

  // local state used for reder page
  const [currentNum, setCurrentNum] = useState(0);
  const [evaluating, setEvaluating] = useState(
    Object.keys(questionItems[currentNum].Evaluations).length > 0,
  );

  // 需要实时刷新页面的, 就用useState, 否则直接用内部状态
  const [speechTime, setSpeechTime] = useState(
    questionItems[currentNum].SpeechTime,
  );

  const [recordingStatus, setRecordingStatus] = useState(StageStatus.Start);
  const [recorder, setRecorder] = useState(
    new AudioRecorder(setRecordingStatus),
  );

  // 当currentNum变化时, 更新初始值
  useEffect(() => {
    setSpeechTime(questionItems[currentNum].SpeechTime);
    // setRecordingStatus(StageStatus.Start)
    recorder.resetRecording();
  }, [currentNum, questionItems, recorder]);

  // useEffect(() => {
  //   recorder.resetRecording();
  // }, [currentNum, recorder]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (recordingStatus === StageStatus.Recording) {
      intervalId = setInterval(() => {
        setSpeechTime((prevTime) => prevTime + 1); // 用于刷新页面
        questionItems[currentNum].SpeechTime = speechTime; // 用于保存状态
      }, 1000);
    }

    return () => {
      clearInterval(intervalId);
    };
  }, [currentNum, questionItems, recordingStatus, speechTime]);

  const appendUserInput = (newState: string): void => {
    // 每次按下button时 换行显示
    if (questionItems[currentNum].Speech === "") {
      questionItems[currentNum].Speech = newState;
    } else {
      questionItems[currentNum].Speech += "\n" + newState;
    }
    console.log("newState: ", newState);
  };

  const onRecord = () => {
    recorder.startRecording();
    speechRecognizer.startRecording(
      appendUserInput,
      ToastmastersDefaultLangugage,
    );
  };

  const onPause = () => {
    recorder.pauseRecording();
    speechRecognizer.stopRecording();
  };

  const onPlay = () => {
    questionItems[currentNum].SpeechAudio = recorder.getAudioData();
    const audioData = questionItems[currentNum].SpeechAudio;
    console.log("onPlayRecording: ", audioData);
    if (audioData) {
      const audioUrl = URL.createObjectURL(audioData);
      const audio = new Audio(audioUrl);
      audio.play();
    }
    console.log(
      "questionItems[currentNum].Speech:",
      questionItems[currentNum].Speech,
    );
  };

  // TODO: 会点击2次, 才能切换
  const onReset = () => {
    // 清存储
    questionItems[currentNum].ResetCurrent(); // TODO: don't know why this error
    // questionItems[currentNum].Speech = "";
    // questionItems[currentNum].SpeechTime = 0;
    // questionItems[currentNum].SpeechAudio = null;
    // questionItems[currentNum].Score = 0;
    // questionItems[currentNum].Evaluations = {};
    // 改状态
    setSpeechTime(0);
    setRecordingStatus(StageStatus.Start);
    setEvaluating(false);
    recorder.resetRecording();
  };

  const onStop = () => {
    recorder.stopRecording();
  };

  // TODO: 打分还不太准确
  const onScore = () => {
    recorder.stopRecording();

    console.log("onScore: Speech: ", questionItems[currentNum].Speech);

    // reset status from 0
    // chatStore.resetSessionFromIndex(2);

    let ask = ImpromptuSpeechPrompts.GetScorePrompt(
      currentNum,
      questionItems[currentNum].Question,
      questionItems[currentNum].Speech,
    );
    chatStore.onUserInput(ask);
    chatStore.getIsFinished().then(() => {
      const response = session.messages[session.messages.length - 1].content;
      console.log("score: ", response);
      chatStore.updateCurrentSession(
        (session) => (questionItems[currentNum].Score = parseInt(response)),
      );
    });
    // await chatStore.getIsFinished();
    // const response = session.messages[session.messages.length - 1].content;
    // console.log("score: ", response);
    // chatStore.updateCurrentSession(
    //   (session) => (questionItems[currentNum].Score = parseInt(response)),
    // );

    // finilly get the audio, so it not missing any sentence
    questionItems[currentNum].SpeechAudio = recorder.getAudioData();
    console.log(
      "onScore: SpeechAudio: ",
      questionItems[currentNum].SpeechAudio,
    );
    if (questionItems[currentNum].SpeechAudio === null) {
      showToast("Speech is empty");
      return;
    }
  };

  const evaluationRoles = ImpromptuSpeechPrompts.GetEvaluationRoles();

  const onEvaluation = async (event: { preventDefault: () => void }) => {
    setEvaluating(true);
    // TODO:
    questionItems[currentNum].Speech = questionItems[currentNum].SampleSpeech;

    if (
      questionItems[currentNum].Speech === "" ||
      questionItems[currentNum].Speech === undefined
    ) {
      event.preventDefault();
      showToast("Speech is empty");
      return;
    }

    chatStore.resetSessionFromIndex(2);

    let propmts = ImpromptuSpeechPrompts.GetEvaluationPrompts(
      currentNum,
      questionItems[currentNum].Question,
      questionItems[currentNum].Speech,
    );

    for (const role of evaluationRoles) {
      chatStore.onUserInput(propmts[role]);
      await chatStore.getIsFinished();
      const response = session.messages[session.messages.length - 1].content;
      console.log("response: ", response);
      chatStore.updateCurrentSession(
        (session) => (questionItems[currentNum].Evaluations[role] = response),
      );
    }
    await chatStore.getIsFinished();

    chatStore.resetSessionFromIndex(2);
    setEvaluating(false);
  };

  const handleChangeEvaluationRole = (
    event: React.SyntheticEvent,
    newValue: string,
  ) => {
    setEvaluationRole(newValue);
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const onReturn = () => {
    chatStore.updateCurrentSession(
      (session) =>
        (impromptuSpeechInput.ActivePage = ImpromptuSpeechStage.Start),
    );
  };

  const onPreviousQuestion = () => {
    if (currentNum > 0) {
      setCurrentNum(currentNum - 1);
    }
  };
  const onNextQuestion = () => {
    if (currentNum < questionNums - 1) {
      setCurrentNum(currentNum + 1);
    }
  };

  const onReport = () => {
    chatStore.updateCurrentSession(
      (session) =>
        (impromptuSpeechInput.ActivePage = ImpromptuSpeechStage.Report),
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.navigation}>
        <button className={styles.navButton} onClick={onReturn}>
          {" "}
          ← Return
        </button>
        <ButtonGroup
          aria-label="radius button group"
          sx={{ "--ButtonGroup-radius": "40px" }}
        >
          <Button onClick={onPreviousQuestion}>{"<"}</Button>
          <Button>{`Question ${currentNum + 1} / ${questionNums}`}</Button>
          <Button onClick={onNextQuestion}>{">"}</Button>
        </ButtonGroup>

        <button className={styles.capsuleButton} onClick={onReport}>
          End & Report
        </button>
      </div>

      <BorderLine></BorderLine>

      <form onSubmit={(event) => event.preventDefault()}>
        <p className={styles.questionText}>
          {questionItems[currentNum].Question}
        </p>
        <div className={styles.timer}>
          {/* TODO: 为啥 questionItems[currentNum].SpeechTime 也会刷新? */}
          <span>{formatTime(speechTime)} / 2:00</span>
        </div>
        {recordingStatus === StageStatus.Start && (
          <Stack
            direction="row"
            spacing={5}
            justifyContent="center"
            alignItems="center"
          >
            <IconButtonMui
              aria-label="play"
              onClick={() =>
                speechSynthesizer.startSynthesize(
                  questionItems[currentNum].Question,
                  session.mask.lang,
                )
              }
            >
              <PlayCircleIcon />
            </IconButtonMui>
            <IconButtonMui
              aria-label="record"
              color="primary"
              sx={{
                color: "green",
                fontSize: "40px",
              }}
              onClick={onRecord}
            >
              <MicIcon sx={{ fontSize: "inherit" }} />
            </IconButtonMui>
          </Stack>
        )}

        {recordingStatus === StageStatus.Recording && (
          <Stack
            direction="row"
            spacing={5}
            justifyContent="center"
            alignItems="center"
          >
            <IconButtonMui
              aria-label="record"
              color="primary"
              sx={{
                color: "red",
                fontSize: "40px",
              }}
              onClick={onPause}
            >
              <MicIcon sx={{ fontSize: "inherit" }} />
            </IconButtonMui>
          </Stack>
        )}

        {recordingStatus === StageStatus.Paused && (
          <Stack
            direction="row"
            spacing={5}
            justifyContent="center"
            alignItems="center"
          >
            <button className={styles.capsuleButton} onClick={onReset}>
              Reset
            </button>
            {/* TODO: 总是会丢掉当前最新的录音, 不知如何解决 */}
            {/* <button className={styles.capsuleButton} onClick={onPlay} type="button">
              Play
            </button> */}
            <button className={styles.capsuleButton} onClick={onRecord}>
              Resume
            </button>
            <button className={styles.capsuleButton} onClick={onStop}>
              Stop
            </button>
          </Stack>
        )}

        {recordingStatus === StageStatus.Stopped && (
          <Stack
            direction="row"
            spacing={5}
            justifyContent="center"
            alignItems="center"
          >
            <IconButtonMui
              color="secondary"
              aria-label="score"
              sx={{
                backgroundColor: "lightblue", // 淡蓝色背景
                color: "white", // 图标颜色，这里选择了白色
                "&:hover": {
                  backgroundColor: "green", // 鼠标悬停时的背景色，这里选择了蓝色
                },
                borderRadius: "50%", // 圆形
                width: 40, // 宽度
                height: 40, // 高度
                padding: 0, // 如果需要，调整内边距
              }}
              onClick={onReset}
            >
              <Typography variant="subtitle1">Reset</Typography>
            </IconButtonMui>

            <IconButtonMui
              aria-label="record"
              color="primary"
              sx={{
                color: "green",
                fontSize: "40px",
              }}
              onClick={onRecord}
            >
              <MicIcon sx={{ fontSize: "inherit" }} />
            </IconButtonMui>

            <IconButtonMui
              color="secondary"
              aria-label="score"
              sx={{
                backgroundColor: "lightblue", // 淡蓝色背景
                color: "white", // 图标颜色，这里选择了白色
                "&:hover": {
                  backgroundColor: "green", // 鼠标悬停时的背景色，这里选择了蓝色
                },
                borderRadius: "50%", // 圆形
                width: 40, // 宽度
                height: 40, // 高度
                padding: 0, // 如果需要，调整内边距
              }}
              onClick={onPlay}
            >
              <Typography variant="subtitle1">Play</Typography>
            </IconButtonMui>
          </Stack>
        )}
      </form>

      <BorderLine></BorderLine>

      <Accordion sx={{ backgroundColor: "#f5f5f5", userSelect: "text" }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Sample Speech</Typography>
        </AccordionSummary>
        <AccordionDetails style={{ textAlign: "left" }}>
          <Markdown
            content={questionItems[currentNum].SampleSpeech}
            fontSize={config.fontSize}
            parentRef={scrollRef}
          />
          <Stack
            direction="row"
            spacing={5}
            justifyContent="center"
            alignItems="center"
          >
            <IconButtonMui
              aria-label="play"
              onClick={() =>
                speechSynthesizer.startSynthesize(
                  questionItems[currentNum].SampleSpeech,
                  session.mask.lang,
                )
              }
            >
              <PlayCircleIcon />
            </IconButtonMui>
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Accordion
        sx={{
          backgroundColor: "#f5f5f5",
          userSelect: "text",
          marginTop: "5px",
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography>Evaluations</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ width: "100%", typography: "body1" }}>
            <TabContext value={evaluationRole}>
              <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
                <TabList
                  onChange={handleChangeEvaluationRole}
                  aria-label="lab API tabs example"
                >
                  {evaluationRoles.map((role, index) => (
                    <Tab
                      key={index}
                      label={role}
                      value={role}
                      sx={{ textTransform: "none" }}
                    />
                  ))}
                </TabList>
              </Box>
              {evaluationRoles.map((role, index) => (
                <TabPanel key={index} value={role}>
                  {role in questionItems[currentNum].Evaluations ? (
                    <Typography style={{ textAlign: "left" }}>
                      <ReactMarkdown>
                        {questionItems[currentNum].Evaluations[role]}
                      </ReactMarkdown>
                      <Stack
                        direction="row"
                        spacing={5}
                        justifyContent="center"
                        alignItems="center"
                      >
                        <IconButtonMui
                          aria-label="play"
                          onClick={() =>
                            speechSynthesizer.startSynthesize(
                              questionItems[currentNum].Evaluations[role],
                              session.mask.lang,
                            )
                          }
                        >
                          <PlayCircleIcon />
                        </IconButtonMui>
                      </Stack>
                    </Typography>
                  ) : evaluating ? (
                    <CircularProgress />
                  ) : (
                    <Button onClick={(event) => onEvaluation(event)}>
                      Look Evaluation
                    </Button>
                  )}
                </TabPanel>
              ))}
            </TabContext>
          </Box>
        </AccordionDetails>
      </Accordion>
    </div>
  );
};
